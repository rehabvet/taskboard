import { NextRequest, NextResponse } from 'next/server'
import { getPool, initDb } from '@/lib/db'

const EDIT_PIN = process.env.EDIT_PIN || '1234'
const MAX_IMAGE_SIZE = 3 * 1024 * 1024 // 3MB base64 data limit
const MAX_IMAGES_PER_TASK = 10

function checkPin(req: NextRequest) {
  return req.headers.get('x-edit-pin') === EDIT_PIN
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initDb()
    const db = getPool()
    const { rows } = await db.query(
      `SELECT id, filename, data, created_at FROM task_images WHERE task_id = $1 ORDER BY created_at`,
      [params.id]
    )
    return NextResponse.json({ images: rows })
  } catch (err: any) {
    console.error('GET images error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkPin(req)) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  try {
    await initDb()
    const db = getPool()
    const body = await req.json()
    const { data, filename = '' } = body

    if (!data || typeof data !== 'string' || !data.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
    }
    if (data.length > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image too large (max 2MB)' }, { status: 400 })
    }

    // Check count limit
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM task_images WHERE task_id = $1`,
      [params.id]
    )
    if (countRows[0].cnt >= MAX_IMAGES_PER_TASK) {
      return NextResponse.json({ error: `Max ${MAX_IMAGES_PER_TASK} images per task` }, { status: 400 })
    }

    const { rows } = await db.query(
      `INSERT INTO task_images (task_id, data, filename) VALUES ($1, $2, $3) RETURNING id, filename, data, created_at`,
      [params.id, data, filename]
    )
    return NextResponse.json({ image: rows[0] }, { status: 201 })
  } catch (err: any) {
    console.error('POST image error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
