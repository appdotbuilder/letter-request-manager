import { db } from '../db';
import { 
  dispositionAssignmentsTable, 
  letterRequestsTable, 
  trackingLogsTable,
  usersTable 
} from '../db/schema';
import { type ProcessDispositionInput, type DispositionAssignment } from '../schema';
import { eq, and, asc, gt } from 'drizzle-orm';

export async function processDisposition(input: ProcessDispositionInput, userId: number): Promise<DispositionAssignment> {
  try {
    // 1. Validate that the user is assigned to this disposition and it's not completed
    const assignment = await db.select()
      .from(dispositionAssignmentsTable)
      .where(
        and(
          eq(dispositionAssignmentsTable.id, input.assignment_id),
          eq(dispositionAssignmentsTable.assigned_to_user_id, userId),
          eq(dispositionAssignmentsTable.is_completed, false)
        )
      )
      .execute();

    if (assignment.length === 0) {
      throw new Error('Assignment not found or not assigned to user or already completed');
    }

    const currentAssignment = assignment[0];
    const requestId = currentAssignment.letter_request_id;

    // Get current letter request status
    const letterRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, requestId))
      .execute();

    if (letterRequest.length === 0) {
      throw new Error('Letter request not found');
    }

    const currentRequest = letterRequest[0];
    let newStatus = currentRequest.status;
    let nextHandlerId: number | null = null;

    // Handle escalation
    if (input.escalate) {
      // Find admin user for escalation
      const adminUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.role, 'ADMIN'))
        .execute();

      if (adminUser.length > 0) {
        newStatus = 'ESCALATED';
        nextHandlerId = adminUser[0].id;
      }
    } 
    // Handle coordination flag
    else if (input.flag_for_coordination) {
      // Find dean for coordination
      const dekanUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.role, 'DEKAN'))
        .execute();

      if (dekanUser.length > 0) {
        newStatus = 'FORWARDED_TO_DEKAN';
        nextHandlerId = dekanUser[0].id;
      }
    } 
    // Normal processing flow
    else {
      // Check if there are more assignments in the sequence
      const nextAssignment = await db.select()
        .from(dispositionAssignmentsTable)
        .where(
          and(
            eq(dispositionAssignmentsTable.letter_request_id, requestId),
            gt(dispositionAssignmentsTable.order_sequence, currentAssignment.order_sequence),
            eq(dispositionAssignmentsTable.is_completed, false)
          )
        )
        .orderBy(asc(dispositionAssignmentsTable.order_sequence))
        .limit(1)
        .execute();

      if (nextAssignment.length > 0) {
        // Move to next officer in sequence
        nextHandlerId = nextAssignment[0].assigned_to_user_id;
        // Status remains in disposition processing
      } else {
        // This is the last assignment, prepare for final letter creation
        newStatus = 'TTD_READY';
        // Find dean for signing
        const dekanUser = await db.select()
          .from(usersTable)
          .where(eq(usersTable.role, 'DEKAN'))
          .execute();

        if (dekanUser.length > 0) {
          nextHandlerId = dekanUser[0].id;
        }
      }
    }

    // 2. Mark the assignment as completed
    const updatedAssignment = await db.update(dispositionAssignmentsTable)
      .set({
        is_completed: true,
        completed_at: new Date(),
        notes: input.notes || null
      })
      .where(eq(dispositionAssignmentsTable.id, input.assignment_id))
      .returning()
      .execute();

    // Update letter request status and handler
    await db.update(letterRequestsTable)
      .set({
        status: newStatus,
        current_handler_user_id: nextHandlerId,
        updated_at: new Date()
      })
      .where(eq(letterRequestsTable.id, requestId))
      .execute();

    // 8. Create appropriate tracking log entries
    let actionType: 'PROCESSED' | 'ESCALATED' = 'PROCESSED';
    let description = 'Disposition assignment completed';

    if (input.escalate) {
      actionType = 'ESCALATED';
      description = 'Request escalated to admin';
    } else if (input.flag_for_coordination) {
      description = 'Request flagged for dean coordination';
    } else if (newStatus === 'TTD_READY') {
      description = 'All disposition assignments completed, ready for signing';
    }

    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: requestId,
        user_id: userId,
        action_type: actionType,
        description: description,
        notes: input.notes || null,
        previous_status: currentRequest.status,
        new_status: newStatus
      })
      .execute();

    return updatedAssignment[0];
  } catch (error) {
    console.error('Process disposition failed:', error);
    throw error;
  }
}