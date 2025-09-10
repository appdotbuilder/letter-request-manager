import { db } from '../db';
import { dispositionAssignmentsTable, letterRequestsTable, usersTable } from '../db/schema';
import { type DispositionAssignment } from '../schema';
import { eq, and, asc } from 'drizzle-orm';

export async function getDispositionAssignments(requestId: number, userId?: number): Promise<DispositionAssignment[]> {
  try {
    // If userId is provided, validate that the user has permission to view dispositions for this request
    if (userId) {
      // Check if the request exists and if the user has permission to view it
      const requestCheck = await db.select()
        .from(letterRequestsTable)
        .where(eq(letterRequestsTable.id, requestId))
        .execute();

      if (requestCheck.length === 0) {
        return []; // Request not found
      }

      const request = requestCheck[0];
      
      // Check if user has permission:
      // 1. User created the request
      // 2. User is the current handler
      // 3. User has been assigned to any disposition for this request
      const hasDirectPermission = request.created_by_user_id === userId || 
                                 request.current_handler_user_id === userId;

      if (!hasDirectPermission) {
        // Check if user has any disposition assignment for this request
        const userAssignments = await db.select()
          .from(dispositionAssignmentsTable)
          .where(
            and(
              eq(dispositionAssignmentsTable.letter_request_id, requestId),
              eq(dispositionAssignmentsTable.assigned_to_user_id, userId)
            )
          )
          .execute();

        if (userAssignments.length === 0) {
          return []; // No permission to view dispositions
        }
      }
    }

    // Query disposition assignments with user information, sorted by order_sequence
    const results = await db.select({
      id: dispositionAssignmentsTable.id,
      letter_request_id: dispositionAssignmentsTable.letter_request_id,
      assigned_to_user_id: dispositionAssignmentsTable.assigned_to_user_id,
      assigned_by_user_id: dispositionAssignmentsTable.assigned_by_user_id,
      instructions: dispositionAssignmentsTable.instructions,
      order_sequence: dispositionAssignmentsTable.order_sequence,
      is_completed: dispositionAssignmentsTable.is_completed,
      completed_at: dispositionAssignmentsTable.completed_at,
      notes: dispositionAssignmentsTable.notes,
      created_at: dispositionAssignmentsTable.created_at
    })
      .from(dispositionAssignmentsTable)
      .where(eq(dispositionAssignmentsTable.letter_request_id, requestId))
      .orderBy(asc(dispositionAssignmentsTable.order_sequence))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get disposition assignments:', error);
    throw error;
  }
}