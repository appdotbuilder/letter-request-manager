import { db } from '../db';
import { letterRequestsTable, supportingDocumentsTable, trackingLogsTable, usersTable, studentsTable } from '../db/schema';
import { type CreateLetterRequestInput, type LetterRequest } from '../schema';
import { eq } from 'drizzle-orm';

export async function createLetterRequest(input: CreateLetterRequestInput, userId: number): Promise<LetterRequest> {
  try {
    // First, verify the student exists and get their prodi
    const studentResult = await db.select()
      .from(studentsTable)
      .where(eq(studentsTable.id, input.student_id))
      .execute();
    
    if (studentResult.length === 0) {
      throw new Error('Student not found');
    }

    const student = studentResult[0];

    // Find the Kaprodi for this student's prodi to set as current handler
    const kaprodiResult = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'KAPRODI'))
      .execute();
    
    // Filter for matching prodi (since we can't use AND with role and prodi in single query)
    const kaprodi = kaprodiResult.find(user => user.prodi === student.prodi);
    
    if (!kaprodi) {
      throw new Error(`No Kaprodi found for prodi: ${student.prodi}`);
    }

    // Create the letter request
    const letterRequestResult = await db.insert(letterRequestsTable)
      .values({
        student_id: input.student_id,
        created_by_user_id: userId,
        letter_type: input.letter_type,
        purpose: input.purpose,
        priority: input.priority,
        status: 'DRAFT',
        current_handler_user_id: kaprodi.id
      })
      .returning()
      .execute();

    const letterRequest = letterRequestResult[0];

    // Upload supporting documents if provided
    if (input.supporting_documents && input.supporting_documents.length > 0) {
      for (const doc of input.supporting_documents) {
        await db.insert(supportingDocumentsTable)
          .values({
            letter_request_id: letterRequest.id,
            file_name: doc.file_name,
            file_url: doc.file_url,
            uploaded_by_user_id: userId
          })
          .execute();
      }
    }

    // Create initial tracking log entry
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: letterRequest.id,
        user_id: userId,
        action_type: 'CREATED',
        description: `Letter request created: ${input.letter_type}`,
        notes: `Purpose: ${input.purpose}`,
        previous_status: null,
        new_status: 'DRAFT'
      })
      .execute();

    return letterRequest;
  } catch (error) {
    console.error('Letter request creation failed:', error);
    throw error;
  }
}