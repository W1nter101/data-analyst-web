import { NextRequest, NextResponse } from 'next/server';

import { importCsvToSqlite } from '@/lib/csvToSqlite';

export async function POST(request: NextRequest) {
  try {
    const { csvText } = await request.json();

    if (!csvText) {
      return NextResponse.json(
        { error: 'csvText is required' },
        { status: 400 },
      );
    }

    // Populate SQLite database with the uploaded CSV data
    importCsvToSqlite(csvText);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Upload API Error:', error);
    return NextResponse.json(
      { error: 'Failed to populate SQLite database' },
      { status: 500 },
    );
  }
}
