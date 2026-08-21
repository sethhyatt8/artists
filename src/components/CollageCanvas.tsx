import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  CANVAS_SIZE,
  clampPieceSize,
  duplicatePiece,
  groupBounds,
  hitTestPiece,
  idsInRect,
  isJunkKind,
  isLetterKind,
  normalizeRect,
  toggleId,
  type CollagePiece,
} from '../game/collage'
import { PiecePaths } from './PieceGlyph'

type CollageCanvasProps = {
  pieces: CollagePiece[]
  selectedIds: string[]
  onPiecesChange: (pieces: CollagePiece[]) => void
  onSelect: (ids: string[]) => void
  readOnly?: boolean
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onBeforeMutate?: () => void
}

type Drag =
  | {
      mode: 'move'
      ids: string[]
      lastX: number
      lastY: number
    }
  | {
      mode: 'lasso'
      startX: number
      startY: number
      additive: boolean
    }
  | {
      mode: 'rotate'
      id: string
      startAngle: number
      origRotation: number
    }
  | {
      mode: 'scale'
      id: string
      startDist: number
      origWidth: number
      origHeight: number
    }
  | {
      mode: 'spin'
      ids: string[]
      centerX: number
      centerY: number
      lastAngle: number
    }
  | {
      mode: 'pinch'
      ids: string[]
      lastSpan: number
      lastAngle: number
    }

type ActivePointer = {
  id: number
  clientX: number
  clientY: number
}

type PendingPress = {
  pointerId: number
  id: string
  startClientX: number
  startClientY: number
  canvasX: number
  canvasY: number
  timer: number
}

type PieceMenu = {
  pieceId: string
  x: number
  y: number
}

const LONG_PRESS_MS = 480
const DRAG_SLOP = 10
const MENU_WIDTH = 188
const MENU_HEIGHT = 176

function wheelScaleFactor(event: WheelEvent) {
  let dy = event.deltaY
  if (event.deltaMode === 1) dy *= 16
  if (event.deltaMode === 2) dy *= 80
  return Math.min(1.18, Math.max(0.85, Math.exp(-dy * 0.0022)))
}

export function CollageCanvas({
  pieces,
  selectedIds,
  onPiecesChange,
  onSelect,
  readOnly = false,
  onGestureStart,
  onGestureEnd,
  onBeforeMutate,
}: CollageCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const piecesRef = useRef(pieces)
  const selectedRef = useRef(selectedIds)
  const dragRef = useRef<Drag | null>(null)
  const pendingRef = useRef<PendingPress | null>(null)
  const lassoRef = useRef<ReturnType<typeof normalizeRect> | null>(null)
  const [menu, setMenu] = useState<PieceMenu | null>(null)
  const [lasso, setLasso] = useState<ReturnType<typeof normalizeRect> | null>(null)
  const wheelBurstRef = useRef(false)
  const wheelTimerRef = useRef<number | null>(null)
  const pointersRef = useRef<Map<number, ActivePointer>>(new Map())

  useEffect(() => {
    piecesRef.current = pieces
  }, [pieces])

  useEffect(() => {
    selectedRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    if (!menu) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }

    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      const root = frameRef.current?.querySelector('.piece-menu')
      if (root?.contains(target)) return
      setMenu(null)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [menu])

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const mapped = point.matrixTransform(ctm.inverse())
    return { x: mapped.x, y: mapped.y }
  }, [])

  const commitPieces = useCallback(
    (next: CollagePiece[]) => {
      piecesRef.current = next
      onPiecesChange(next)
    },
    [onPiecesChange],
  )

  const updatePiece = useCallback(
    (id: string, patch: Partial<CollagePiece>) => {
      commitPieces(
        piecesRef.current.map((piece) =>
          piece.id === id ? { ...piece, ...patch } : piece,
        ),
      )
    },
    [commitPieces],
  )

  const pieceAt = useCallback((x: number, y: number) => {
    const current = piecesRef.current
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (hitTestPiece(current[i], x, y)) return current[i]
    }
    return null
  }, [])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedPieces = useMemo(
    () => pieces.filter((piece) => selectedSet.has(piece.id)),
    [pieces, selectedSet],
  )
  const bounds = useMemo(() => groupBounds(selectedPieces), [selectedPieces])
  const solo = selectedPieces.length === 1 ? selectedPieces[0] : null

  function clearPending() {
    const pending = pendingRef.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pendingRef.current = null
  }

  function menuPosition(clientX: number, clientY: number) {
    const frame = frameRef.current
    if (!frame) return { x: 8, y: 8 }
    const box = frame.getBoundingClientRect()
    return {
      x: Math.min(Math.max(8, clientX - box.left), Math.max(8, box.width - MENU_WIDTH - 8)),
      y: Math.min(Math.max(8, clientY - box.top), Math.max(8, box.height - MENU_HEIGHT - 8)),
    }
  }

  function openMenu(pieceId: string, clientX: number, clientY: number) {
    clearPending()
    dragRef.current = null
    if (!selectedRef.current.includes(pieceId)) {
      onSelect([pieceId])
    }
    setMenu({ pieceId, ...menuPosition(clientX, clientY) })
  }

  function startMove(ids: string[], x: number, y: number) {
    setMenu(null)
    onGestureStart?.()
    dragRef.current = { mode: 'move', ids, lastX: x, lastY: y }
  }

  function idsForEdit(x: number, y: number) {
    const hit = pieceAt(x, y)
    if (hit && selectedRef.current.includes(hit.id)) return selectedRef.current
    if (hit) return [hit.id]
    return selectedRef.current
  }

  function scaleIds(ids: string[], factor: number) {
    const idSet = new Set(ids)
    let changed = false
    const next = piecesRef.current.map((piece) => {
      if (!idSet.has(piece.id)) return piece
      const width = clampPieceSize(piece.width * factor)
      if (width === piece.width) return piece
      changed = true
      const ratio = piece.height / piece.width
      return { ...piece, width, height: clampPieceSize(width * ratio) }
    })
    if (changed) commitPieces(next)
  }

  function rememberPointer(event: PointerEvent<SVGElement>) {
    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  function forgetPointer(pointerId: number) {
    pointersRef.current.delete(pointerId)
  }

  function pinchPair() {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return null
    const [a, b] = points
    if (!a || !b) return null
    return { a, b }
  }

  function beginPinch() {
    const pair = pinchPair()
    if (!pair) return
    const ax = toCanvas(pair.a.clientX, pair.a.clientY)
    const bx = toCanvas(pair.b.clientX, pair.b.clientY)
    const midX = (ax.x + bx.x) / 2
    const midY = (ax.y + bx.y) / 2
    const ids = idsForEdit(midX, midY)
    if (ids.length === 0) return
    clearPending()
    setMenu(null)
    setLasso(null)
    lassoRef.current = null
    if (dragRef.current?.mode !== 'pinch') onGestureStart?.()
    dragRef.current = {
      mode: 'pinch',
      ids,
      lastSpan: Math.max(8, Math.hypot(bx.x - ax.x, bx.y - ax.y)),
      lastAngle: Math.atan2(bx.y - ax.y, bx.x - ax.x),
    }
  }

  function startSpin(ids: string[], x: number, y: number) {
    const targets = piecesRef.current.filter((piece) => ids.includes(piece.id))
    const box = groupBounds(targets)
    const centerX = box ? box.x + box.width / 2 : x
    const centerY = box ? box.y + box.height / 2 : y
    setMenu(null)
    clearPending()
    onGestureStart?.()
    dragRef.current = {
      mode: 'spin',
      ids,
      centerX,
      centerY,
      lastAngle: Math.atan2(y - centerY, x - centerX),
    }
  }

  function beginMiddleSpin(
    event: PointerEvent<SVGElement>,
    x: number,
    y: number,
    hitId: string | null,
  ) {
    const selected = selectedRef.current
    let ids: string[]
    if (hitId && selected.includes(hitId)) ids = selected
    else if (hitId) {
      ids = [hitId]
      selectedRef.current = ids
      onSelect(ids)
    } else if (selected.length > 0) ids = selected
    else return

    event.preventDefault()
    svgRef.current?.setPointerCapture(event.pointerId)
    startSpin(ids, x, y)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || readOnly) return

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return
      if (dragRef.current) return
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      const { x, y } = toCanvas(event.clientX, event.clientY)
      const ids = idsForEdit(x, y)
      if (ids.length === 0) return
      event.preventDefault()
      const factor = wheelScaleFactor(event)
      if (Math.abs(factor - 1) < 0.002) return
      if (!wheelBurstRef.current) {
        wheelBurstRef.current = true
        onGestureStart?.()
      }
      scaleIds(ids, factor)
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = window.setTimeout(() => {
        wheelBurstRef.current = false
        wheelTimerRef.current = null
        onGestureEnd?.()
      }, 280)
    }

    function preventMiddleAutoscroll(event: globalThis.MouseEvent) {
      if (event.button === 1) event.preventDefault()
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('mousedown', preventMiddleAutoscroll)
    svg.addEventListener('auxclick', preventMiddleAutoscroll)
    return () => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('mousedown', preventMiddleAutoscroll)
      svg.removeEventListener('auxclick', preventMiddleAutoscroll)
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current)
      if (wheelBurstRef.current) {
        wheelBurstRef.current = false
        onGestureEnd?.()
      }
    }
  }, [commitPieces, onGestureEnd, onGestureStart, pieceAt, readOnly, toCanvas])

  function isAdditive(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    return event.shiftKey || event.ctrlKey || event.metaKey
  }

  function onBackgroundPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (readOnly) return
    if (event.target !== svgRef.current) return
    if (event.button === 2) return
    rememberPointer(event)
    if (event.pointerType !== 'mouse' && pinchPair()) {
      beginPinch()
      return
    }

    const { x, y } = toCanvas(event.clientX, event.clientY)
    if (event.button === 1) {
      beginMiddleSpin(event, x, y, pieceAt(x, y)?.id ?? null)
      return
    }
    const hit = pieceAt(x, y)
    if (hit) {
      beginPiecePress(event, hit.id, x, y)
      return
    }

    clearPending()
    setMenu(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode: 'lasso',
      startX: x,
      startY: y,
      additive: isAdditive(event),
    }
    const seed = normalizeRect(x, y, x, y)
    lassoRef.current = seed
    setLasso(seed)
  }

  function onGroupPointerDown(event: PointerEvent<SVGRectElement>) {
    event.stopPropagation()
    if (event.button === 2) return
    rememberPointer(event)
    if (event.pointerType !== 'mouse' && pinchPair()) {
      beginPinch()
      return
    }
    const { x, y } = toCanvas(event.clientX, event.clientY)
    if (event.button === 1) {
      beginMiddleSpin(event, x, y, selectedRef.current[0] ?? null)
      return
    }
    svgRef.current?.setPointerCapture(event.pointerId)
    startMove(selectedRef.current, x, y)
  }

  function onPiecePointerDown(event: PointerEvent<SVGGElement>, id: string) {
    event.stopPropagation()
    if (event.button === 2) {
      if (!selectedRef.current.includes(id)) onSelect([id])
      return
    }
    rememberPointer(event)
    if (event.pointerType !== 'mouse' && pinchPair()) {
      beginPinch()
      return
    }
    const { x, y } = toCanvas(event.clientX, event.clientY)
    if (event.button === 1) {
      beginMiddleSpin(event, x, y, id)
      return
    }
    beginPiecePress(event, id, x, y)
  }

  function beginPiecePress(
    event: PointerEvent<SVGElement>,
    id: string,
    canvasX: number,
    canvasY: number,
  ) {
    clearPending()
    setMenu(null)

    if (isAdditive(event)) {
      const next = toggleId(selectedRef.current, id)
      selectedRef.current = next
      onSelect(next)
      return
    }

    const alreadyGrouped =
      selectedRef.current.includes(id) && selectedRef.current.length > 1
    const ids = alreadyGrouped ? selectedRef.current : [id]
    if (!alreadyGrouped) {
      selectedRef.current = ids
      onSelect(ids)
    }

    if (event.pointerType !== 'mouse') {
      pendingRef.current = {
        pointerId: event.pointerId,
        id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        canvasX,
        canvasY,
        timer: window.setTimeout(() => {
          pendingRef.current = null
          openMenu(id, event.clientX, event.clientY)
        }, LONG_PRESS_MS),
      }
      return
    }

    svgRef.current?.setPointerCapture(event.pointerId)
    startMove(ids, canvasX, canvasY)
  }

  function onRotatePointerDown(
    event: PointerEvent<SVGCircleElement>,
    piece: CollagePiece,
  ) {
    event.stopPropagation()
    if (event.button !== 0) return
    clearPending()
    setMenu(null)
    const { x, y } = toCanvas(event.clientX, event.clientY)
    svgRef.current?.setPointerCapture(event.pointerId)
    onGestureStart?.()
    dragRef.current = {
      mode: 'rotate',
      id: piece.id,
      startAngle: Math.atan2(y - piece.y, x - piece.x),
      origRotation: piece.rotation,
    }
  }

  function onScalePointerDown(
    event: PointerEvent<SVGRectElement>,
    piece: CollagePiece,
  ) {
    event.stopPropagation()
    if (event.button !== 0) return
    clearPending()
    setMenu(null)
    const { x, y } = toCanvas(event.clientX, event.clientY)
    svgRef.current?.setPointerCapture(event.pointerId)
    onGestureStart?.()
    dragRef.current = {
      mode: 'scale',
      id: piece.id,
      startDist: Math.max(8, Math.hypot(x - piece.x, y - piece.y)),
      origWidth: piece.width,
      origHeight: piece.height,
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      rememberPointer(event)
    }
    if (dragRef.current?.mode === 'pinch') {
      const pair = pinchPair()
      if (!pair) return
      const ax = toCanvas(pair.a.clientX, pair.a.clientY)
      const bx = toCanvas(pair.b.clientX, pair.b.clientY)
      const span = Math.max(8, Math.hypot(bx.x - ax.x, bx.y - ax.y))
      const angle = Math.atan2(bx.y - ax.y, bx.x - ax.x)
      const factor = span / dragRef.current.lastSpan
      let delta = ((angle - dragRef.current.lastAngle) * 180) / Math.PI
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      const spinning = new Set(dragRef.current.ids)
      commitPieces(
        piecesRef.current.map((piece) => {
          if (!spinning.has(piece.id)) return piece
          const width = clampPieceSize(piece.width * factor)
          const ratio = piece.height / piece.width
          return {
            ...piece,
            width,
            height: clampPieceSize(width * ratio),
            rotation: piece.rotation + delta,
          }
        }),
      )
      dragRef.current.lastSpan = span
      dragRef.current.lastAngle = angle
      return
    }

    const pending = pendingRef.current
    if (pending && pending.pointerId === event.pointerId) {
      const dist = Math.hypot(
        event.clientX - pending.startClientX,
        event.clientY - pending.startClientY,
      )
      if (dist > DRAG_SLOP) {
        const ids =
          selectedRef.current.includes(pending.id) && selectedRef.current.length > 1
            ? selectedRef.current
            : [pending.id]
        clearPending()
        svgRef.current?.setPointerCapture(event.pointerId)
        startMove(ids, pending.canvasX, pending.canvasY)
      }
    }

    const drag = dragRef.current
    if (!drag) return
    const { x, y } = toCanvas(event.clientX, event.clientY)

    if (drag.mode === 'lasso') {
      const rect = normalizeRect(drag.startX, drag.startY, x, y)
      lassoRef.current = rect
      setLasso(rect)
      return
    }

    if (drag.mode === 'move') {
      const dx = x - drag.lastX
      const dy = y - drag.lastY
      const moving = new Set(drag.ids)
      commitPieces(
        piecesRef.current.map((piece) =>
          moving.has(piece.id) ? { ...piece, x: piece.x + dx, y: piece.y + dy } : piece,
        ),
      )
      drag.lastX = x
      drag.lastY = y
      return
    }

    if (drag.mode === 'spin') {
      const angle = Math.atan2(y - drag.centerY, x - drag.centerX)
      let delta = ((angle - drag.lastAngle) * 180) / Math.PI
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      const spinning = new Set(drag.ids)
      commitPieces(
        piecesRef.current.map((piece) =>
          spinning.has(piece.id) ? { ...piece, rotation: piece.rotation + delta } : piece,
        ),
      )
      drag.lastAngle = angle
      return
    }

    const piece = piecesRef.current.find((item) => item.id === drag.id)
    if (!piece) return

    if (drag.mode === 'rotate') {
      const angle = Math.atan2(y - piece.y, x - piece.x)
      const delta = ((angle - drag.startAngle) * 180) / Math.PI
      updatePiece(drag.id, { rotation: drag.origRotation + delta })
      return
    }

    const dist = Math.max(8, Math.hypot(x - piece.x, y - piece.y))
    const factor = dist / drag.startDist
    const nextWidth = clampPieceSize(drag.origWidth * factor)
    const ratio = drag.origHeight / drag.origWidth
    updatePiece(drag.id, {
      width: nextWidth,
      height: clampPieceSize(nextWidth * ratio),
    })
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    forgetPointer(event.pointerId)
    if (dragRef.current?.mode === 'pinch') {
      if (pinchPair()) {
        beginPinch()
        return
      }
      dragRef.current = null
      clearPending()
      onGestureEnd?.()
      return
    }

    const drag = dragRef.current
    clearPending()
    dragRef.current = null
    if (
      drag?.mode === 'move' ||
      drag?.mode === 'rotate' ||
      drag?.mode === 'scale' ||
      drag?.mode === 'spin'
    ) {
      onGestureEnd?.()
    }

    if (drag?.mode === 'lasso') {
      const rect = lassoRef.current
      lassoRef.current = null
      setLasso(null)
      if (!rect || (rect.width < 8 && rect.height < 8)) {
        if (!drag.additive) onSelect([])
        return
      }
      const hit = idsInRect(piecesRef.current, rect)
      onSelect(drag.additive ? [...new Set([...selectedRef.current, ...hit])] : hit)
    }
  }

  function onContextMenu(event: MouseEvent<SVGSVGElement>) {
    event.preventDefault()
    const { x, y } = toCanvas(event.clientX, event.clientY)
    const hit = pieceAt(x, y)
    if (!hit) {
      setMenu(null)
      onSelect([])
      return
    }
    openMenu(hit.id, event.clientX, event.clientY)
  }

  function targetIds() {
    const menuId = menu?.pieceId
    if (menuId && selectedRef.current.includes(menuId) && selectedRef.current.length > 1) {
      return selectedRef.current
    }
    return menuId ? [menuId] : []
  }

  function runMenuAction(action: 'duplicate' | 'front' | 'back' | 'delete') {
    const ids = targetIds()
    setMenu(null)
    if (ids.length === 0) return
    const current = piecesRef.current
    const idSet = new Set(ids)

    if (action === 'duplicate') {
      const copies = current.filter((piece) => idSet.has(piece.id)).map(duplicatePiece)
      onBeforeMutate?.()
      commitPieces([...current, ...copies])
      onSelect(copies.map((piece) => piece.id))
      return
    }

    if (action === 'front') {
      const rest = current.filter((piece) => !idSet.has(piece.id))
      const moving = current.filter((piece) => idSet.has(piece.id))
      onBeforeMutate?.()
      commitPieces([...rest, ...moving])
      onSelect(ids)
      return
    }

    if (action === 'back') {
      const rest = current.filter((piece) => !idSet.has(piece.id))
      const moving = current.filter((piece) => idSet.has(piece.id))
      onBeforeMutate?.()
      commitPieces([...moving, ...rest])
      onSelect(ids)
      return
    }

    onBeforeMutate?.()
    commitPieces(current.filter((piece) => !idSet.has(piece.id)))
    onSelect([])
  }

  return (
    <div className="canvas-frame" ref={frameRef}>
      <svg
        ref={svgRef}
        className={readOnly ? 'collage-svg readonly' : 'collage-svg'}
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        role="img"
        aria-label="Collage canvas"
        onPointerDown={readOnly ? undefined : onBackgroundPointerDown}
        onPointerMove={readOnly ? undefined : onPointerMove}
        onPointerUp={readOnly ? undefined : onPointerUp}
        onPointerCancel={readOnly ? undefined : onPointerUp}
        onContextMenu={readOnly ? (event) => event.preventDefault() : onContextMenu}
      >
        {bounds && selectedPieces.length > 1 && !readOnly ? (
          <rect
            className="group-bounds"
            x={bounds.x}
            y={bounds.y}
            width={bounds.width}
            height={bounds.height}
            onPointerDown={onGroupPointerDown}
          />
        ) : null}

        {pieces.map((piece) => (
          <g
            key={piece.id}
            className={selectedSet.has(piece.id) ? 'piece selected' : 'piece'}
            transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotation})`}
            onPointerDown={
              readOnly ? undefined : (event) => onPiecePointerDown(event, piece.id)
            }
            onContextMenu={
              readOnly
                ? undefined
                : (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openMenu(piece.id, event.clientX, event.clientY)
                  }
            }
          >
            <ShapePath piece={piece} />
          </g>
        ))}

        {lasso ? (
          <rect
            className="lasso"
            x={lasso.x}
            y={lasso.y}
            width={lasso.width}
            height={lasso.height}
          />
        ) : null}

        {solo && !readOnly ? (
          <g
            className="handles"
            transform={`translate(${solo.x} ${solo.y}) rotate(${solo.rotation})`}
          >
            <rect
              className="handle-bounds"
              x={-solo.width / 2}
              y={-solo.height / 2}
              width={solo.width}
              height={solo.height}
            />
            <line
              className="handle-stem"
              x1={0}
              y1={-solo.height / 2}
              x2={0}
              y2={-solo.height / 2 - 56}
            />
            <circle
              className="handle rotate"
              cx={0}
              cy={-solo.height / 2 - 56}
              r={18}
              onPointerDown={(event) => onRotatePointerDown(event, solo)}
            />
            <rect
              className="handle scale"
              x={solo.width / 2 - 16}
              y={solo.height / 2 - 16}
              width={32}
              height={32}
              rx={4}
              onPointerDown={(event) => onScalePointerDown(event, solo)}
            />
          </g>
        ) : null}
      </svg>

      {menu && !readOnly ? (
        <div
          className="piece-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => runMenuAction('duplicate')}>
            Duplicate
          </button>
          <button type="button" role="menuitem" onClick={() => runMenuAction('front')}>
            Bring to front
          </button>
          <button type="button" role="menuitem" onClick={() => runMenuAction('back')}>
            Send to back
          </button>
          <button type="button" role="menuitem" onClick={() => runMenuAction('delete')}>
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ShapePath({ piece }: { piece: CollagePiece }) {
  if (isLetterKind(piece.kind)) {
    return (
      <text
        fill={piece.color}
        fontFamily="Arial Black, Impact, sans-serif"
        fontSize={piece.height * 0.9}
        fontWeight={800}
        textAnchor="middle"
        dominantBaseline="central"
        stroke="#1a1410"
        strokeWidth={Math.max(2, piece.height * 0.03)}
        paintOrder="stroke fill"
        style={{ userSelect: 'none' }}
      >
        {piece.kind}
      </text>
    )
  }

  if (isJunkKind(piece.kind)) {
    return (
      <g transform={`scale(${piece.width / 100} ${piece.height / 100})`}>
        <PiecePaths kind={piece.kind} color={piece.color} />
      </g>
    )
  }

  const hw = piece.width / 2
  const hh = piece.height / 2
  const fill = piece.color

  if (piece.kind === 'circle') {
    return <ellipse fill={fill} rx={hw} ry={hh} />
  }

  if (piece.kind === 'square') {
    return <rect fill={fill} x={-hw} y={-hh} width={piece.width} height={piece.height} />
  }

  if (piece.kind === 'round') {
    const radius = Math.min(hw, hh) * 0.35
    return (
      <rect
        fill={fill}
        x={-hw}
        y={-hh}
        width={piece.width}
        height={piece.height}
        rx={radius}
        ry={radius}
      />
    )
  }

  if (piece.kind === 'triangle') {
    return (
      <polygon
        fill={fill}
        points={`0,${-hh} ${-hw},${hh} ${hw},${hh}`}
      />
    )
  }

  if (piece.kind === 'diamond') {
    return (
      <polygon
        fill={fill}
        points={`0,${-hh} ${hw},0 0,${hh} ${-hw},0`}
      />
    )
  }

  const hx = hw * 0.5
  return (
    <polygon
      fill={fill}
      points={`${-hx},${-hh} ${hx},${-hh} ${hw},0 ${hx},${hh} ${-hx},${hh} ${-hw},0`}
    />
  )
}
