import { db } from '../db';
import { letterRequestsTable, trackingLogsTable } from '../db/schema';
import { type UpdateRequestStatusInput, type LetterRequest } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function updateRequestStatus(input: UpdateRequestStatusInput, userId: number): Promise<LetterRequest> {
  try {
    // First, fetch the current request to validate permissions and get current state
    const existingRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    if (!existingRequest.length) {
      throw new Error(`Letter request with ID ${input.request_id} not found`);
    }

    const currentRequest = existingRequest[0];

    // Basic permission check - user must be the current handler or creator
    if (currentRequest.current_handler_user_id !== userId && 
        currentRequest.created_by_user_id !== userId) {
      throw new Error('User does not have permission to update this request');
    }

    // Update the request status and handler
    const updateData: {
      status: typeof input.new_status;
      current_handler_user_id?: number | null;
      updated_at: Date;
    } = {
      status: input.new_status,
      updated_at: new Date()
    };

    // Set next handler if provided
    if (input.next_handler_user_id !== undefined) {
      updateData.current_handler_user_id = input.next_handler_user_id;
    }

    const updatedRequest = await db.update(letterRequestsTable)
      .set(updateData)
      .where(eq(letterRequestsTable.id, input.request_id))
      .returning()
      .execute();

    if (!updatedRequest.length) {
      throw new Error('Failed to update letter request');
    }

    // Create tracking log entry
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: userId,
        action_type: 'APPROVED', // Generic action type - could be refined based on status
        description: `Status updated from ${currentRequest.status} to ${input.new_status}`,
        notes: input.notes || null,
        previous_status: currentRequest.status,
        new_status: input.new_status
      })
      .execute();

    return updatedRequest[0];
  } catch (error) {
    console.error('Request status update failed:', error);
    throw error;
  }
}