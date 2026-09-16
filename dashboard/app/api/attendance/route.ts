import { NextResponse } from 'next/server';

// In a real application, you would use a database.
// For now, we'll use an in-memory array to simulate a database.
const attendanceRecords: any[] = [];

/**
 * Handles POST requests to record a new attendance action (check-in/check-out).
 * @param {Request} request - The incoming HTTP request.
 * @returns {NextResponse} - The response object.
 */
export async function POST(request: Request) {
  try {
    const { userId, action } = await request.json(); // action can be 'check-in' or 'check-out'

    if (!userId || !action) {
      return NextResponse.json({ message: 'User ID and action are required' }, { status: 400 });
    }

    const timestamp = new Date();
    
    // This is a simplified logic. A real backend would have more complex logic
    // to find the latest record for the user for the day and update it, or create a new one.
    const record = {
      id: `rec_${Date.now()}`,
      userId,
      action,
      timestamp,
    };

    attendanceRecords.push(record);
    console.log('Updated Attendance Records on Server:', attendanceRecords);

    return NextResponse.json({ message: `${action} successful`, record }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Handles GET requests to fetch attendance history for a user.
 * @param {Request} request - The incoming HTTP request.
 * @returns {NextResponse} - The response object.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        // In a real app, you might get the user ID from the session.
        // For now, we can return all records or require a userId.
        return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    // Filter records for the specific user
    const userRecords = attendanceRecords.filter(rec => rec.userId === userId);

    return NextResponse.json(userRecords);
}