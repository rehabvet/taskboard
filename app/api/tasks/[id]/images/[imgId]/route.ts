import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

const EDIT_PIN = process.env.EDIT_PIN || '1234'

function checkPin(req: NextRequest) {
  return req.headers.get('x-edit-pin') === EDIT_PIN
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; imgId: string } }) {
  if (!checkPin(req)) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  try {
    const db = getPool()
    await db.query(`DELETE FROM task_images WHERE id = $1 AND task_id = $2`, [params.imgId, params.id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE image error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
