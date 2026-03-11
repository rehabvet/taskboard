import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

const EDIT_PIN = process.env.EDIT_PIN || '1234'

function checkPin(req: NextRequest) {
  return req.headers.get('x-edit-pin') === EDIT_PIN
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkPin(req)) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  const db = getPool()
  const body = await req.json()
  const { title, description, status, priority, assignee, sort_order } = body
  const { rows } = await db.query(
    `UPDATE tasks SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      status = COALESCE($3, status),
      priority = COALESCE($4, priority),
      assignee = COALESCE($5, assignee),
      sort_order = COALESCE($6, sort_order),
      updated_at = NOW()
    WHERE id = $7 RETURNING *`,
    [title, description, status, priority, assignee, sort_order, params.id]
  )
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ task: rows[0] })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkPin(req)) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  const db = getPool()
  await db.query(`DELETE FROM tasks WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
