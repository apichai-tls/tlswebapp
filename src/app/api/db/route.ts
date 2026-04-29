import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const dbPath = path.join(process.cwd(), 'src', 'lib', 'data', 'local-db.json');

export async function GET() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    // If file doesn't exist or is invalid, return an empty structure
    // that matches the Database interface
    console.error('Failed to read local-db.json:', error);
    return NextResponse.json({
      customers: [],
      jobs: [],
      riders: [],
      services: [],
      priceLists: [],
      shopLocations: [],
      pois: [],
      settings: {}
    });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to write local-db.json:', error);
    return NextResponse.json({ error: 'Failed to write database' }, { status: 500 });
  }
}
