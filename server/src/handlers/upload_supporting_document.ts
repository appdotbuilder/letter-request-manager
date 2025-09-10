import { db } from '../db';
import { supportingDocumentsTable, trackingLogsTable, letterRequestsTable, usersTable } from '../db/schema';
import { type SupportingDocument } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function uploadSupportingDocument(
    requestId: number, 
    fileName: string, 
    fileUrl: string, 
    userId: number
): Promise<SupportingDocument> {
    try {
        // Validate that the letter request exists and get its details
        const letterRequestResult = await db.select({
            id: letterRequestsTable.id,
            student_id: letterRequestsTable.student_id,
            created_by_user_id: letterRequestsTable.created_by_user_id,
            current_handler_user_id: letterRequestsTable.current_handler_user_id,
            status: letterRequestsTable.status
        })
        .from(letterRequestsTable)
        .where(eq(letterRequestsTable.id, requestId))
        .execute();

        if (letterRequestResult.length === 0) {
            throw new Error('Letter request not found');
        }

        const letterRequest = letterRequestResult[0];

        // Validate that the user exists
        const userResult = await db.select({
            id: usersTable.id,
            role: usersTable.role,
            prodi: usersTable.prodi
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

        if (userResult.length === 0) {
            throw new Error('User not found');
        }

        const user = userResult[0];

        // Validate user permissions to upload documents for this request
        const canUpload = (
            // Request creator can always upload
            letterRequest.created_by_user_id === userId ||
            // Current handler can upload
            letterRequest.current_handler_user_id === userId ||
            // Admin can always upload
            user.role === 'ADMIN' ||
            // Staff can upload for requests in their domain
            (user.role === 'STAFF_PRODI' || user.role === 'KAPRODI') ||
            user.role === 'STAFF_FAKULTAS' ||
            user.role === 'DEKAN' ||
            user.role.startsWith('WD') ||
            user.role.startsWith('KABAG') ||
            user.role.startsWith('KAUR')
        );

        if (!canUpload) {
            throw new Error('User does not have permission to upload documents for this request');
        }

        // Create the supporting document record
        const documentResult = await db.insert(supportingDocumentsTable)
            .values({
                letter_request_id: requestId,
                file_name: fileName,
                file_url: fileUrl,
                uploaded_by_user_id: userId
            })
            .returning()
            .execute();

        const document = documentResult[0];

        // Create tracking log entry for the upload
        await db.insert(trackingLogsTable)
            .values({
                letter_request_id: requestId,
                user_id: userId,
                action_type: 'DOCUMENT_UPLOADED',
                description: `Supporting document uploaded: ${fileName}`,
                notes: `File URL: ${fileUrl}`
            })
            .execute();

        return document;
    } catch (error) {
        console.error('Document upload failed:', error);
        throw error;
    }
}