import { db } from '../db';
import { letterRequestsTable, usersTable, trackingLogsTable } from '../db/schema';
import { type UploadFinalLetterInput, type LetterRequest } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function uploadFinalLetter(input: UploadFinalLetterInput, userId: number): Promise<LetterRequest> {
  try {
    // 1. Validate that the letter request exists
    const existingRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    if (existingRequest.length === 0) {
      throw new Error(`Letter request with ID ${input.request_id} not found`);
    }

    const request = existingRequest[0];

    // 2. Validate that the user is authorized to upload the final letter
    // Check if user is currently assigned to handle this request
    if (request.current_handler_user_id !== userId) {
      throw new Error('User is not authorized to upload final letter for this request');
    }

    // 3. Validate request status - should be in one of the "PROCESSED_BY_" states
    const validStatuses = [
      'PROCESSED_BY_KAUR_AKADEMIK',
      'PROCESSED_BY_KAUR_KEMAHASISWAAN', 
      'PROCESSED_BY_KAUR_KEUANGAN',
      'PROCESSED_BY_WD1',
      'PROCESSED_BY_WD2',
      'PROCESSED_BY_WD3',
      'PROCESSED_BY_KABAG_TU'
    ];

    if (!validStatuses.includes(request.status)) {
      throw new Error(`Cannot upload final letter for request in status: ${request.status}`);
    }

    // 4. Find a DEKAN user to set as next handler
    const dekanUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'DEKAN'))
      .execute();

    if (dekanUsers.length === 0) {
      throw new Error('No DEKAN user found to assign as next handler');
    }

    const dekanUserId = dekanUsers[0].id;

    // 5. Update the letter request with final letter URL and change status to TTD_READY
    const updatedRequest = await db.update(letterRequestsTable)
      .set({
        final_letter_url: input.file_url,
        status: 'TTD_READY',
        current_handler_user_id: dekanUserId,
        updated_at: new Date()
      })
      .where(eq(letterRequestsTable.id, input.request_id))
      .returning()
      .execute();

    // 6. Create tracking log entry
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: userId,
        action_type: 'DOCUMENT_UPLOADED',
        description: 'Final letter document uploaded and ready for signature',
        notes: `Final letter uploaded: ${input.file_url}`,
        previous_status: request.status,
        new_status: 'TTD_READY'
      })
      .execute();

    return updatedRequest[0];
  } catch (error) {
    console.error('Upload final letter failed:', error);
    throw error;
  }
}