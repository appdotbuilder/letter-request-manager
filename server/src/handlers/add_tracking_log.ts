import { db } from '../db';
import { trackingLogsTable, letterRequestsTable, usersTable } from '../db/schema';
import { type AddTrackingLogInput, type TrackingLog } from '../schema';
import { eq } from 'drizzle-orm';

export const addTrackingLog = async (input: AddTrackingLogInput, userId: number): Promise<TrackingLog> => {
  try {
    // Validate that the letter request exists
    const letterRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    if (letterRequest.length === 0) {
      throw new Error(`Letter request with ID ${input.request_id} not found`);
    }

    // Validate that the user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Insert the tracking log entry
    const result = await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: userId,
        action_type: input.action_type,
        description: input.description,
        notes: input.notes !== undefined ? input.notes : null,
        previous_status: input.previous_status || null,
        new_status: input.new_status || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Tracking log creation failed:', error);
    throw error;
  }
};