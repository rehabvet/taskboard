import { NextRequest, NextResponse } from 'next/server'
import { getPool, initDb } from '@/lib/db'

const EDIT_PIN = process.env.EDIT_PIN || '1234'

function checkPin(req: NextRequest) {
  const pin = req.headers.get('x-edit-pin')
  return pin === EDIT_PIN
}

export async function GET() {
  try {
    await initDb()
    const db = getPool()
    const { rows } = await db.query(
      `SELECT t.*, COALESCE(ic.cnt, 0)::int AS image_count
       FROM tasks t
       LEFT JOIN (SELECT task_id, COUNT(*) AS cnt FROM task_images GROUP BY task_id) ic ON ic.task_id = t.id
       ORDER BY t.status, t.sort_order, t.created_at`
    )
    return NextResponse.json({ tasks: rows })
  } catch (err: any) {
    console.error('GET /api/tasks error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!checkPin(req)) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  try {
    await initDb()
    const db = getPool()
    const body = await req.json()
    const { title, description = '', status = 'todo', priority = 'medium', assignee = '', due_date = null, labels = [] } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
    const { rows } = await db.query(
      `INSERT INTO tasks (title, description, status, priority, assignee, due_date, labels) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title.trim(), description, status, priority, assignee, due_date || null, labels]
    )
    return NextResponse.json({ task: rows[0] }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/tasks error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
