import { db } from '../db';
import { 
  letterRequestsTable, 
  studentsTable, 
  usersTable, 
  supportingDocumentsTable, 
  trackingLogsTable, 
  dispositionAssignmentsTable 
} from '../db/schema';
import { type LetterRequest } from '../schema';
import { eq } from 'drizzle-orm';

export const getRequestById = async (requestId: number, userId?: number): Promise<LetterRequest | null> => {
  try {
    // Query the letter request with all related data
    const results = await db.select()
      .from(letterRequestsTable)
      .leftJoin(studentsTable, eq(letterRequestsTable.student_id, studentsTable.id))
      .leftJoin(usersTable, eq(letterRequestsTable.created_by_user_id, usersTable.id))
      .where(eq(letterRequestsTable.id, requestId))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    const letterRequest = result.letter_requests;
    const student = result.students;
    const creator = result.users;

    // Basic permission check: users can view requests they created,
    // or requests where they are the current handler, or admin users can view all
    if (userId) {
      // Get the requesting user's role
      const requestingUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      if (requestingUser.length === 0) {
        return null; // Invalid user ID
      }

      const userRole = requestingUser[0].role;

      // Check permissions:
      // 1. Admin can view all requests
      // 2. User created this request
      // 3. User is current handler
      // 4. User has a role that can generally access requests (DEKAN, WD1, WD2, WD3, etc.)
      const canViewRequest = userRole === 'ADMIN' ||
        letterRequest.created_by_user_id === userId ||
        letterRequest.current_handler_user_id === userId ||
        ['DEKAN', 'WD1', 'WD2', 'WD3', 'KABAG_TU', 'KAUR_AKADEMIK', 'KAUR_KEMAHASISWAAN', 'KAUR_KEUANGAN', 'STAFF_FAKULTAS'].includes(userRole);

      if (!canViewRequest) {
        return null;
      }
    }

    // Get supporting documents
    const supportingDocs = await db.select()
      .from(supportingDocumentsTable)
      .leftJoin(usersTable, eq(supportingDocumentsTable.uploaded_by_user_id, usersTable.id))
      .where(eq(supportingDocumentsTable.letter_request_id, requestId))
      .execute();

    // Get tracking logs
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .leftJoin(usersTable, eq(trackingLogsTable.user_id, usersTable.id))
      .where(eq(trackingLogsTable.letter_request_id, requestId))
      .execute();

    // Get disposition assignments
    const dispositions = await db.select()
      .from(dispositionAssignmentsTable)
      .leftJoin(usersTable, eq(dispositionAssignmentsTable.assigned_to_user_id, usersTable.id))
      .where(eq(dispositionAssignmentsTable.letter_request_id, requestId))
      .execute();

    // Get current handler details if exists
    let currentHandler = null;
    if (letterRequest.current_handler_user_id) {
      const handlerResults = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, letterRequest.current_handler_user_id))
        .execute();
      
      if (handlerResults.length > 0) {
        currentHandler = handlerResults[0];
      }
    }

    // Construct the complete response
    return {
      id: letterRequest.id,
      student_id: letterRequest.student_id,
      created_by_user_id: letterRequest.created_by_user_id,
      letter_type: letterRequest.letter_type,
      purpose: letterRequest.purpose,
      priority: letterRequest.priority,
      status: letterRequest.status,
      current_handler_user_id: letterRequest.current_handler_user_id,
      dekan_instructions: letterRequest.dekan_instructions,
      final_letter_url: letterRequest.final_letter_url,
      created_at: letterRequest.created_at,
      updated_at: letterRequest.updated_at,
      // Additional related data (not part of LetterRequest type but useful)
      student: student ? {
        id: student.id,
        nim: student.nim,
        name: student.name,
        prodi: student.prodi,
        created_at: student.created_at
      } : null,
      created_by: creator ? {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        role: creator.role,
        prodi: creator.prodi,
        created_at: creator.created_at,
        updated_at: creator.updated_at
      } : null,
      current_handler: currentHandler ? {
        id: currentHandler.id,
        email: currentHandler.email,
        name: currentHandler.name,
        role: currentHandler.role,
        prodi: currentHandler.prodi,
        created_at: currentHandler.created_at,
        updated_at: currentHandler.updated_at
      } : null,
      supporting_documents: supportingDocs.map(doc => ({
        id: doc.supporting_documents.id,
        letter_request_id: doc.supporting_documents.letter_request_id,
        file_name: doc.supporting_documents.file_name,
        file_url: doc.supporting_documents.file_url,
        uploaded_by_user_id: doc.supporting_documents.uploaded_by_user_id,
        created_at: doc.supporting_documents.created_at,
        uploaded_by: doc.users ? {
          id: doc.users.id,
          name: doc.users.name,
          email: doc.users.email,
          role: doc.users.role
        } : null
      })),
      tracking_logs: trackingLogs.map(log => ({
        id: log.tracking_logs.id,
        letter_request_id: log.tracking_logs.letter_request_id,
        user_id: log.tracking_logs.user_id,
        action_type: log.tracking_logs.action_type,
        description: log.tracking_logs.description,
        notes: log.tracking_logs.notes,
        previous_status: log.tracking_logs.previous_status,
        new_status: log.tracking_logs.new_status,
        created_at: log.tracking_logs.created_at,
        user: log.users ? {
          id: log.users.id,
          name: log.users.name,
          email: log.users.email,
          role: log.users.role
        } : null
      })),
      disposition_assignments: dispositions.map(disp => ({
        id: disp.disposition_assignments.id,
        letter_request_id: disp.disposition_assignments.letter_request_id,
        assigned_to_user_id: disp.disposition_assignments.assigned_to_user_id,
        assigned_by_user_id: disp.disposition_assignments.assigned_by_user_id,
        instructions: disp.disposition_assignments.instructions,
        order_sequence: disp.disposition_assignments.order_sequence,
        is_completed: disp.disposition_assignments.is_completed,
        completed_at: disp.disposition_assignments.completed_at,
        notes: disp.disposition_assignments.notes,
        created_at: disp.disposition_assignments.created_at,
        assigned_to: disp.users ? {
          id: disp.users.id,
          name: disp.users.name,
          email: disp.users.email,
          role: disp.users.role
        } : null
      }))
    } as any; // Extended LetterRequest with related data

  } catch (error) {
    console.error('Failed to get request by ID:', error);
    throw error;
  }
};