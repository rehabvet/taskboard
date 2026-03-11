'use client'

import { useState, useEffect, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

const COLUMNS = [
  { id: 'backlog',     label: '📥 Backlog',     color: 'bg-amber-50 border-amber-200',  headerColor: 'text-amber-700' },
  { id: 'todo',        label: '📋 To Do',       color: 'bg-slate-50 border-slate-200',  headerColor: 'text-slate-700' },
  { id: 'in_progress', label: '⚙️ In Progress', color: 'bg-blue-50 border-blue-200',    headerColor: 'text-blue-700' },
  { id: 'done',        label: '✅ Done',         color: 'bg-green-50 border-green-200',  headerColor: 'text-green-700' },
]

const PRIORITY_CONFIG: Record<string, { style: string; icon: string }> = {
  high:   { style: 'bg-red-100 text-red-700',       icon: '🔴' },
  medium: { style: 'bg-yellow-100 text-yellow-700',  icon: '🟡' },
  low:    { style: 'bg-slate-100 text-slate-500',    icon: '🔵' },
}

const LABEL_OPTIONS = ['bug', 'feature'] as const

const LABEL_STYLES: Record<string, string> = {
  bug:       'bg-red-100 text-red-700',
  feature:   'bg-blue-100 text-blue-700',
  urgent:    'bg-orange-100 text-orange-700',
  blocked:   'bg-gray-200 text-gray-600',
  design:    'bg-purple-100 text-purple-700',
  marketing: 'bg-green-100 text-green-700',
}

interface Task {
  id: string
  title: string
  description: string
  status: string
  priority: string
  assignee: string
  sort_order: number
  due_date: string | null
  labels: string[]
  created_at: string
  image_count: number
}

interface TaskImage {
  id: string
  filename: string
  data: string
  created_at: string
}

const BLANK_FORM = { title: '', description: '', status: 'todo', priority: 'medium', assignee: '', due_date: '', labels: [] as string[] }

function dueDateStatus(due_date: string | null): 'overdue' | 'today' | 'future' | null {
  if (!due_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(due_date + 'T00:00:00')
  if (due < today) return 'overdue'
  if (due.getTime() === today.getTime()) return 'today'
  return 'future'
}

function formatDate(due_date: string) {
  return new Date(due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Board() {
  const [tasks, setTasks]       = useState<Task[]>([])
  const [pin, setPin]           = useState('')
  const [savedPin, setSavedPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPinModal, setShowPinModal] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ ...BLANK_FORM })
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [saving, setSaving]     = useState(false)

  // Image state
  const [pendingImages, setPendingImages] = useState<{ data: string; filename: string }[]>([])
  const [existingImages, setExistingImages] = useState<TaskImage[]>([])
  const [lightbox, setLightbox] = useState<{ taskId: string; images: TaskImage[]; index: number } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/tasks')
    const d = await res.json()
    setTasks(d.tasks || [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  function api(path: string, method: string, body?: any) {
    return fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-edit-pin': savedPin },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async function verifyPin() {
    const res = await api('/api/tasks', 'POST', { title: '__ping__', status: 'todo', priority: 'low' })
    if (res.status === 401) { setPinError('Wrong PIN — try again.'); return }
    const d = await res.json()
    if (d.task?.id) await api(`/api/tasks/${d.task.id}`, 'DELETE')
    setSavedPin(pin)
    setEditMode(true)
    setShowPinModal(false)
    setPinError('')
  }

  async function saveTask() {
    setSaving(true)
    try {
      const payload = { ...form, due_date: form.due_date || null }
      let taskId = editTask?.id
      if (editTask) {
        await api(`/api/tasks/${editTask.id}`, 'PATCH', payload)
      } else {
        const res = await api('/api/tasks', 'POST', payload)
        const d = await res.json()
        taskId = d.task?.id
      }
      // Upload pending images (fire-and-forget, don't block save)
      if (taskId && pendingImages.length > 0) {
        for (const img of pendingImages) {
          await api(`/api/tasks/${taskId}/images`, 'POST', img).catch(() => {})
        }
      }
      await load()
      closeForm()
    } catch (e) {
      console.error('saveTask error:', e)
      alert('Failed to save task. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditTask(null)
    setForm({ ...BLANK_FORM })
    setPendingImages([])
    setExistingImages([])
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await api(`/api/tasks/${id}`, 'DELETE')
    setTasks(t => t.filter(x => x.id !== id))
  }

  async function onDragEnd(result: DropResult) {
    if (!editMode) return
    const { destination, draggableId } = result
    if (!destination) return
    const newStatus = destination.droppableId
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus, sort_order: destination.index } : t))
    await api(`/api/tasks/${draggableId}`, 'PATCH', { status: newStatus, sort_order: destination.index })
  }

  async function openEdit(task: Task) {
    if (!editMode) return
    setEditTask(task)
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      labels: task.labels || [],
    })
    setPendingImages([])
    setExistingImages([])
    setShowForm(true)
    // Lazy-load existing images
    if (task.image_count > 0) {
      const res = await fetch(`/api/tasks/${task.id}/images`)
      const d = await res.json()
      setExistingImages(d.images || [])
    }
  }

  function openNew(colId: string) {
    setEditTask(null)
    setForm({ ...BLANK_FORM, status: colId })
    setShowForm(true)
  }

  function toggleLabel(label: string) {
    setForm(f => ({
      ...f,
      labels: f.labels.includes(label) ? f.labels.filter(l => l !== label) : [...f.labels, label],
    }))
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const totalCount = existingImages.length + pendingImages.length + files.length
    if (totalCount > 10) { alert('Max 10 images per task'); return }
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) { alert(`${file.name} exceeds 5MB limit`); return }
      const reader = new FileReader()
      reader.onload = () => {
        const data = reader.result as string
        setPendingImages(prev => [...prev, { data, filename: file.name }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function deleteExistingImage(taskId: string, imgId: string) {
    await api(`/api/tasks/${taskId}/images/${imgId}`, 'DELETE')
    setExistingImages(prev => prev.filter(img => img.id !== imgId))
  }

  async function openLightbox(taskId: string, clickIndex?: number) {
    const res = await fetch(`/api/tasks/${taskId}/images`)
    const d = await res.json()
    const images = d.images || []
    if (images.length > 0) setLightbox({ taskId, images, index: clickIndex ?? 0 })
  }

  const byStatus = (status: string) =>
    tasks.filter(t => t.status === status).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

  const colLabel = COLUMNS.find(c => c.id === form.status)?.label ?? 'Task'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐾</span>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">RehabVet Taskboard</h1>
            <p className="text-xs text-slate-400">App development tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <button onClick={() => setEditMode(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              🔒 Lock
            </button>
          ) : (
            <button
              onClick={() => { setPin(''); setPinError(''); setShowPinModal(true) }}
              className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              🔑 Edit
            </button>
          )}
        </div>
      </header>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 p-5 overflow-x-auto min-h-[calc(100vh-64px)] items-start">
          {COLUMNS.map(col => (
            <div key={col.id} className="flex-1 min-w-[260px] max-w-[380px] flex flex-col">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <h2 className={`font-bold text-sm ${col.headerColor}`}>{col.label}</h2>
                  <span className="bg-white text-slate-400 text-xs font-semibold px-1.5 py-0.5 rounded-full border border-slate-200 min-w-[20px] text-center">
                    {byStatus(col.id).length}
                  </span>
                </div>
                {editMode && (
                  <button
                    onClick={() => openNew(col.id)}
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-pink-500 hover:border-pink-300 flex items-center justify-center text-base leading-none transition-colors shadow-sm"
                    title={`Add to ${col.label}`}
                  >+</button>
                )}
              </div>

              {/* Column body */}
              <div className={`rounded-2xl border ${col.color} p-3 flex-1`}>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2.5 min-h-[80px] rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-white/50' : ''}`}
                    >
                      {byStatus(col.id).map((task, index) => {
                        const dueStatus = dueDateStatus(task.due_date)
                        const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!editMode}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={`bg-white rounded-xl p-3.5 shadow-sm border border-slate-100 transition-all
                                  ${snap.isDragging ? 'shadow-xl rotate-1 border-pink-200' : 'hover:shadow-md hover:border-slate-200'}
                                  ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                onClick={() => openEdit(task)}
                              >
                                {/* Labels row */}
                                {task.labels && task.labels.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {task.labels.map(label => (
                                      <span key={label} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LABEL_STYLES[label] || 'bg-slate-100 text-slate-500'}`}>
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Title + priority */}
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="font-semibold text-slate-800 text-sm leading-snug flex-1">{task.title}</p>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${pc.style}`}>
                                    {pc.icon}
                                  </span>
                                </div>

                                {/* Description */}
                                {task.description && (
                                  <p className="text-xs text-slate-400 mb-2 line-clamp-2 leading-relaxed">{task.description}</p>
                                )}

                                {/* Image count badge */}
                                {task.image_count > 0 && (
                                  <div className="flex items-center gap-1 mb-1">
                                    <button
                                      onClick={e => { e.stopPropagation(); openLightbox(task.id) }}
                                      className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors"
                                    >
                                      🖼️ {task.image_count}
                                    </button>
                                  </div>
                                )}

                                {/* Footer: assignee + due date + delete */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                                  <div className="flex items-center gap-2">
                                    {task.assignee && (
                                      <span className="flex items-center gap-1">
                                        <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                          {task.assignee.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="text-xs text-slate-400">{task.assignee}</span>
                                      </span>
                                    )}
                                    {task.due_date && (
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                        dueStatus === 'overdue' ? 'bg-red-100 text-red-600' :
                                        dueStatus === 'today'   ? 'bg-amber-100 text-amber-600' :
                                                                   'bg-slate-100 text-slate-500'
                                      }`}>
                                        📅 {formatDate(task.due_date)}
                                        {dueStatus === 'overdue' && ' ⚠️'}
                                      </span>
                                    )}
                                  </div>
                                  {editMode && (
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
                                      className="text-slate-200 hover:text-red-400 transition-colors text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-red-50"
                                    >×</button>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                      {byStatus(col.id).length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex flex-col items-center justify-center py-10 gap-1">
                          <p className="text-slate-300 text-xs select-none">No tasks</p>
                          {editMode && (
                            <button onClick={() => openNew(col.id)} className="text-xs text-slate-300 hover:text-pink-400 transition-colors mt-1">
                              + add one
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs">
            <h2 className="text-base font-bold text-slate-800 mb-1">🔑 Enter PIN</h2>
            <p className="text-xs text-slate-400 mb-4">Unlock editing to add and move cards.</p>
            <input
              type="password"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest mb-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              maxLength={6}
              value={pin}
              onChange={e => { setPin(e.target.value); setSavedPin(e.target.value) }}
              onKeyDown={e => e.key === 'Enter' && verifyPin()}
              autoFocus
            />
            {pinError && <p className="text-red-500 text-xs mb-2 text-center">{pinError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowPinModal(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={verifyPin} className="flex-1 py-2 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600">Unlock</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editTask ? 'Edit Task' : 'New Task'}</h2>
                {!editTask && <p className="text-xs text-slate-400 mt-0.5">Adding to {colLabel}</p>}
              </div>
              <button onClick={closeForm} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none">×</button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Title */}
              <input
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                placeholder="Task title…"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />

              {/* Description */}
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent resize-none"
                rows={2}
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />

              {/* Labels */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">Labels</p>
                <div className="flex flex-wrap gap-1.5">
                  {LABEL_OPTIONS.map(label => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleLabel(label)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                        form.labels.includes(label)
                          ? `${LABEL_STYLES[label]} border-current shadow-sm`
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority row */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Priority</p>
                <div className="flex gap-1.5">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, priority: p }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        form.priority === p
                          ? `${PRIORITY_CONFIG[p].style} border-current shadow-sm`
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {PRIORITY_CONFIG[p].icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <input
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                placeholder="Assignee (optional)"
                value={form.assignee}
                onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
              />

              {/* Attachments */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">Attachments</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {existingImages.map(img => (
                    <div key={img.id} className="relative group">
                      <img src={img.data} alt={img.filename} className="w-[50px] h-[50px] rounded-lg object-cover border border-slate-200" />
                      <button
                        type="button"
                        onClick={() => editTask && deleteExistingImage(editTask.id, img.id)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >×</button>
                    </div>
                  ))}
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.data} alt={img.filename} className="w-[50px] h-[50px] rounded-lg object-cover border border-slate-200 border-dashed" />
                      <button
                        type="button"
                        onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >×</button>
                    </div>
                  ))}
                </div>
                {existingImages.length + pendingImages.length < 10 && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-pink-500 hover:text-pink-600 cursor-pointer transition-colors">
                    <span>+ Add images</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                  </label>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={closeForm} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveTask}
                disabled={!form.title.trim() || saving}
                className="flex-1 py-2.5 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : editTask ? 'Save changes' : 'Add task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none w-10 h-10 flex items-center justify-center"
          >×</button>
          {lightbox.images.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(lb => lb && ({ ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length })) }}
                className="absolute left-4 text-white/70 hover:text-white text-3xl leading-none w-10 h-10 flex items-center justify-center"
              >‹</button>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(lb => lb && ({ ...lb, index: (lb.index + 1) % lb.images.length })) }}
                className="absolute right-16 text-white/70 hover:text-white text-3xl leading-none w-10 h-10 flex items-center justify-center"
              >›</button>
            </>
          )}
          <img
            src={lightbox.images[lightbox.index].data}
            alt={lightbox.images[lightbox.index].filename}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-white/50 text-xs">
            {lightbox.images[lightbox.index].filename && <span>{lightbox.images[lightbox.index].filename} · </span>}
            {lightbox.index + 1} / {lightbox.images.length}
          </div>
        </div>
      )}
    </div>
  )
}
