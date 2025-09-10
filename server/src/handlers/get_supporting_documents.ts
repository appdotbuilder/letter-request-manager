import { db } from '../db';
import { supportingDocumentsTable, letterRequestsTable, usersTable } from '../db/schema';
import { type SupportingDocument } from '../schema';
import { eq, and, asc } from 'drizzle-orm';

export async function getSupportingDocuments(requestId: number, userId?: number): Promise<SupportingDocument[]> {
  try {
    // If userId is provided, check if user has permission to view this request
    if (userId) {
      const letterRequest = await db.select()
        .from(letterRequestsTable)
        .where(eq(letterRequestsTable.id, requestId))
        .execute();

      if (letterRequest.length === 0) {
        return []; // Request not found
      }

      const request = letterRequest[0];

      // Check if user has permission to view this request
      // User can view if they are:
      // 1. The creator of the request
      // 2. The current handler
      // 3. The student who requested it (would need student_id check)
      const userInfo = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      if (userInfo.length === 0) {
        return []; // User not found
      }

      const user = userInfo[0];
      const hasPermission = request.created_by_user_id === userId ||
                           request.current_handler_user_id === userId ||
                           user.role === 'ADMIN'; // Admin can view all

      if (!hasPermission) {
        return []; // No permission to view documents
      }
    }

    // Retrieve supporting documents with uploader information
    const results = await db.select({
      id: supportingDocumentsTable.id,
      letter_request_id: supportingDocumentsTable.letter_request_id,
      file_name: supportingDocumentsTable.file_name,
      file_url: supportingDocumentsTable.file_url,
      uploaded_by_user_id: supportingDocumentsTable.uploaded_by_user_id,
      created_at: supportingDocumentsTable.created_at,
      uploader_name: usersTable.name,
      uploader_email: usersTable.email
    })
      .from(supportingDocumentsTable)
      .innerJoin(usersTable, eq(supportingDocumentsTable.uploaded_by_user_id, usersTable.id))
      .where(eq(supportingDocumentsTable.letter_request_id, requestId))
      .orderBy(asc(supportingDocumentsTable.created_at))
      .execute();

    // Transform results to match SupportingDocument schema
    return results.map(result => ({
      id: result.id,
      letter_request_id: result.letter_request_id,
      file_name: result.file_name,
      file_url: result.file_url,
      uploaded_by_user_id: result.uploaded_by_user_id,
      created_at: result.created_at
    }));

  } catch (error) {
    console.error('Failed to get supporting documents:', error);
    throw error;
  }
}