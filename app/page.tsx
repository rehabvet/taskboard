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

const LABEL_OPTIONS = ['bug', 'feature', 'urgent', 'blocked', 'design', 'marketing'] as const

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
    const payload = { ...form, due_date: form.due_date || null }
    if (editTask) {
      await api(`/api/tasks/${editTask.id}`, 'PATCH', payload)
    } else {
      await api('/api/tasks', 'POST', payload)
    }
    await load()
    closeForm()
    setSaving(false)
  }

  function closeForm() {
    setShowForm(false)
    setEditTask(null)
    setForm({ ...BLANK_FORM })
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

  function openEdit(task: Task) {
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
    setShowForm(true)
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editTask ? 'Edit Task' : 'New Task'}</h2>
                {!editTask && <p className="text-xs text-slate-400 mt-0.5">Adding to {colLabel}</p>}
              </div>
              <button onClick={closeForm} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none">×</button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4">
              {/* Title */}
              <input
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                placeholder="Task title…"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />

              {/* Description */}
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent resize-none"
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

              {/* Priority + Due date row */}
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">Due date</p>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Assignee */}
              <input
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                placeholder="Assignee (optional)"
                value={form.assignee}
                onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
              />
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
    </div>
  )
}
