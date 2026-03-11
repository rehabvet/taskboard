'use client'

import { useState, useEffect, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

const COLUMNS = [
  { id: 'todo',        label: '📋 To Do',      color: 'bg-slate-100 border-slate-300' },
  { id: 'in_progress', label: '⚙️ In Progress', color: 'bg-blue-50 border-blue-300' },
  { id: 'done',        label: '✅ Done',        color: 'bg-green-50 border-green-300' },
]

const PRIORITY_STYLES: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  low:    'bg-gray-100 text-gray-500 border border-gray-200',
}

interface Task {
  id: string
  title: string
  description: string
  status: string
  priority: string
  assignee: string
  sort_order: number
  created_at: string
}

const BLANK_FORM = { title: '', description: '', status: 'todo', priority: 'medium', assignee: '' }

export default function Board() {
  const [tasks, setTasks]       = useState<Task[]>([])
  const [pin, setPin]           = useState('')
  const [savedPin, setSavedPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPinModal, setShowPinModal] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ ...BLANK_FORM })
  const [editTask, setEditTask]   = useState<Task | null>(null)
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/tasks')
    const d = await res.json()
    setTasks(d.tasks || [])
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-reload every 30s
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
    // cleanup the test task
    const d = await res.json()
    if (d.task?.id) await api(`/api/tasks/${d.task.id}`, 'DELETE')
    setSavedPin(pin)
    setEditMode(true)
    setShowPinModal(false)
    setPinError('')
  }

  async function saveTask() {
    setSaving(true)
    if (editTask) {
      await api(`/api/tasks/${editTask.id}`, 'PATCH', form)
    } else {
      await api('/api/tasks', 'POST', form)
    }
    await load()
    setShowForm(false)
    setEditTask(null)
    setForm({ ...BLANK_FORM })
    setSaving(false)
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await api(`/api/tasks/${id}`, 'DELETE')
    setTasks(t => t.filter(x => x.id !== id))
  }

  async function onDragEnd(result: DropResult) {
    if (!editMode) return
    const { source, destination, draggableId } = result
    if (!destination) return
    const newStatus = destination.droppableId
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus, sort_order: destination.index } : t))
    await api(`/api/tasks/${draggableId}`, 'PATCH', { status: newStatus, sort_order: destination.index })
  }

  function openEdit(task: Task) {
    if (!editMode) return
    setEditTask(task)
    setForm({ title: task.title, description: task.description, status: task.status, priority: task.priority, assignee: task.assignee })
    setShowForm(true)
  }

  const byStatus = (status: string) =>
    tasks.filter(t => t.status === status).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐾</span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">RehabVet Taskboard</h1>
            <p className="text-xs text-slate-400">App development tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {editMode ? (
            <>
              <button
                onClick={() => { setEditTask(null); setForm({ ...BLANK_FORM }); setShowForm(true) }}
                className="bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5"
              >
                + Add Task
              </button>
              <button onClick={() => setEditMode(false)} className="text-sm text-slate-400 hover:text-slate-600 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                Lock 🔒
              </button>
            </>
          ) : (
            <button
              onClick={() => { setPin(''); setPinError(''); setShowPinModal(true) }}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Edit 🔑
            </button>
          )}
        </div>
      </header>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-5 p-6 overflow-x-auto min-h-[calc(100vh-80px)]">
          {COLUMNS.map(col => (
            <div key={col.id} className="flex-1 min-w-[300px] max-w-[400px]">
              <div className={`rounded-2xl border-2 ${col.color} p-4 h-full`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-700">{col.label}</h2>
                  <span className="bg-white text-slate-500 text-xs font-semibold px-2 py-0.5 rounded-full border border-slate-200">
                    {byStatus(col.id).length}
                  </span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-3 min-h-[100px] rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-white/60' : ''}`}
                    >
                      {byStatus(col.id).map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!editMode}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`bg-white rounded-xl p-4 shadow-sm border border-slate-200 transition-shadow ${snap.isDragging ? 'shadow-lg rotate-1' : 'hover:shadow-md'} ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              onClick={() => openEdit(task)}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-slate-800 text-sm leading-snug flex-1">{task.title}</p>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                                  {task.priority}
                                </span>
                              </div>
                              {task.description && (
                                <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>
                              )}
                              <div className="flex items-center justify-between">
                                {task.assignee ? (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-[10px]">
                                      {task.assignee.charAt(0).toUpperCase()}
                                    </span>
                                    {task.assignee}
                                  </span>
                                ) : <span />}
                                {editMode && (
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
                                    className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none"
                                  >×</button>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {byStatus(col.id).length === 0 && (
                        <p className="text-center text-slate-300 text-sm py-8 select-none">Drop cards here</p>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Enter Edit PIN</h2>
            <p className="text-sm text-slate-400 mb-4">Enter the PIN to unlock editing.</p>
            <input
              type="password"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest mb-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              maxLength={6}
              value={pin}
              onChange={e => { setPin(e.target.value); setSavedPin(e.target.value) }}
              onKeyDown={e => e.key === 'Enter' && verifyPin()}
              autoFocus
            />
            {pinError && <p className="text-red-500 text-sm mb-2 text-center">{pinError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowPinModal(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={verifyPin} className="flex-1 py-2 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600">Unlock</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-800 mb-4">{editTask ? 'Edit Task' : 'New Task'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
                <input
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="What needs to be done?"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
                <textarea
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                  rows={3}
                  placeholder="More details..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                  <select
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
                  <select
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignee</label>
                <input
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="Who's on this?"
                  value={form.assignee}
                  onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowForm(false); setEditTask(null) }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={saveTask} disabled={!form.title.trim() || saving} className="flex-1 py-2.5 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600 disabled:opacity-50">
                {saving ? 'Saving…' : editTask ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
