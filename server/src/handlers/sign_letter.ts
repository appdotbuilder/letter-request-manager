import { db } from '../db';
import { letterRequestsTable, usersTable, trackingLogsTable } from '../db/schema';
import { type SignLetterInput, type LetterRequest } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function signLetter(input: SignLetterInput, dekanUserId: number): Promise<LetterRequest> {
  try {
    // 1. Validate that the user is a Dean
    const dekan = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, dekanUserId),
          eq(usersTable.role, 'DEKAN')
        )
      )
      .execute();

    if (dekan.length === 0) {
      throw new Error('Only Dean (DEKAN) can sign letters');
    }

    // 2. Fetch the letter request and validate it's ready for signing
    const letterRequests = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    if (letterRequests.length === 0) {
      throw new Error('Letter request not found');
    }

    const letterRequest = letterRequests[0];

    if (letterRequest.status !== 'TTD_READY') {
      throw new Error('Letter request is not ready for signing. Current status: ' + letterRequest.status);
    }

    if (!letterRequest.final_letter_url) {
      throw new Error('Final letter document not found');
    }

    // 3. Find a Staff Fakultas user to handle the next step
    const staffFakultas = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'STAFF_FAKULTAS'))
      .limit(1)
      .execute();

    if (staffFakultas.length === 0) {
      throw new Error('No Staff Fakultas available to handle signed letter');
    }

    // 4. Update request status to TTD_DONE and set Staff Fakultas as current handler
    const updatedRequests = await db.update(letterRequestsTable)
      .set({
        status: 'TTD_DONE',
        current_handler_user_id: staffFakultas[0].id,
        updated_at: new Date()
      })
      .where(eq(letterRequestsTable.id, input.request_id))
      .returning()
      .execute();

    const updatedRequest = updatedRequests[0];

    // 5. Create tracking log entry for the signing action
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: dekanUserId,
        action_type: 'SIGNED',
        description: 'Letter digitally signed by Dean',
        notes: `Digital signature applied using signature data: ${input.signature_data.substring(0, 20)}...`,
        previous_status: 'TTD_READY',
        new_status: 'TTD_DONE'
      })
      .execute();

    // 6. Create tracking log entry for assignment to Staff Fakultas
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: dekanUserId,
        action_type: 'FORWARDED',
        description: `Signed letter forwarded to Staff Fakultas (${staffFakultas[0].name}) for return processing`,
        notes: 'Letter ready for return to prodi or delivery',
        previous_status: 'TTD_DONE',
        new_status: 'TTD_DONE'
      })
      .execute();

    return updatedRequest;
  } catch (error) {
    console.error('Letter signing failed:', error);
    throw error;
  }
}