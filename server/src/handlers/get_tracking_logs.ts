import { db } from '../db';
import { trackingLogsTable, letterRequestsTable, usersTable } from '../db/schema';
import { type TrackingLog } from '../schema';
import { eq, asc, and } from 'drizzle-orm';

export async function getTrackingLogs(requestId: number, userId?: number): Promise<TrackingLog[]> {
  try {
    // If userId is provided, validate that the user has permission to view tracking logs
    if (userId) {
      // Check if the letter request exists and user has permission
      const letterRequestResult = await db.select()
        .from(letterRequestsTable)
        .leftJoin(usersTable, eq(letterRequestsTable.created_by_user_id, usersTable.id))
        .where(eq(letterRequestsTable.id, requestId))
        .execute();

      // If request doesn't exist, return empty array
      if (letterRequestResult.length === 0) {
        return [];
      }

      const letterRequest = letterRequestResult[0].letter_requests;
      const createdByUser = letterRequestResult[0].users;

      // Check if user has permission - they can view if:
      // 1. They created the request
      // 2. They are the current handler
      // 3. They are an admin, dean, or other high-level role
      const userResult = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      if (userResult.length === 0) {
        return [];
      }

      const user = userResult[0];
      const hasPermission = 
        letterRequest.created_by_user_id === userId ||
        letterRequest.current_handler_user_id === userId ||
        ['ADMIN', 'DEKAN', 'WD1', 'WD2', 'WD3', 'KABAG_TU'].includes(user.role) ||
        (createdByUser && user.prodi === createdByUser.prodi && ['KAPRODI', 'STAFF_PRODI'].includes(user.role));

      if (!hasPermission) {
        return [];
      }
    } else {
      // If no userId provided, still check if request exists
      const letterRequestExists = await db.select({ id: letterRequestsTable.id })
        .from(letterRequestsTable)
        .where(eq(letterRequestsTable.id, requestId))
        .execute();

      if (letterRequestExists.length === 0) {
        return [];
      }
    }

    // Retrieve tracking logs with user information, sorted chronologically
    const results = await db.select()
      .from(trackingLogsTable)
      .innerJoin(usersTable, eq(trackingLogsTable.user_id, usersTable.id))
      .where(eq(trackingLogsTable.letter_request_id, requestId))
      .orderBy(asc(trackingLogsTable.created_at))
      .execute();

    // Transform results to match TrackingLog schema
    return results.map(result => ({
      id: result.tracking_logs.id,
      letter_request_id: result.tracking_logs.letter_request_id,
      user_id: result.tracking_logs.user_id,
      action_type: result.tracking_logs.action_type,
      description: result.tracking_logs.description,
      notes: result.tracking_logs.notes,
      previous_status: result.tracking_logs.previous_status,
      new_status: result.tracking_logs.new_status,
      created_at: result.tracking_logs.created_at
    }));
  } catch (error) {
    console.error('Failed to retrieve tracking logs:', error);
    throw error;
  }
}