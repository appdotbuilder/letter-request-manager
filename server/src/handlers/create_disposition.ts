import { db } from '../db';
import { 
  usersTable, 
  letterRequestsTable, 
  dispositionAssignmentsTable,
  trackingLogsTable 
} from '../db/schema';
import { type CreateDispositionInput, type DispositionAssignment } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createDisposition(input: CreateDispositionInput, dekanUserId: number): Promise<DispositionAssignment[]> {
  try {
    // 1. Validate that the user is a Dekan
    const dekanUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, dekanUserId))
      .execute();

    if (dekanUser.length === 0 || dekanUser[0].role !== 'DEKAN') {
      throw new Error('Only Dekan can create disposition assignments');
    }

    // 2. Validate that the letter request exists and is in correct status
    const letterRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    if (letterRequest.length === 0) {
      throw new Error('Letter request not found');
    }

    if (letterRequest[0].status !== 'FORWARDED_TO_DEKAN') {
      throw new Error('Letter request must be in FORWARDED_TO_DEKAN status to create disposition');
    }

    // 3. Validate that all assigned users exist and get their roles
    const assignedUserIds = input.assignments.map(a => a.user_id);
    const assignedUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, assignedUserIds[0]))  // We'll validate each separately
      .execute();

    // Validate each user exists
    for (const assignment of input.assignments) {
      const user = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, assignment.user_id))
        .execute();
      
      if (user.length === 0) {
        throw new Error(`Assigned user with ID ${assignment.user_id} not found`);
      }
    }

    // 4. Create disposition assignments
    const dispositionAssignments = await db.insert(dispositionAssignmentsTable)
      .values(
        input.assignments.map(assignment => ({
          letter_request_id: input.request_id,
          assigned_to_user_id: assignment.user_id,
          assigned_by_user_id: dekanUserId,
          instructions: input.instructions,
          order_sequence: assignment.order_sequence,
          is_completed: false,
          completed_at: null,
          notes: null
        }))
      )
      .returning()
      .execute();

    // 5. Get the first assigned user to determine new status and handler
    const firstAssignedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.assignments[0].user_id))
      .execute();

    // Determine the new status based on first assigned user's role
    let newStatus: string;
    const firstUserRole = firstAssignedUser[0].role;
    
    switch (firstUserRole) {
      case 'WD1':
        newStatus = 'DISPOSISI_TO_WD1';
        break;
      case 'WD2':
        newStatus = 'DISPOSISI_TO_WD2';
        break;
      case 'WD3':
        newStatus = 'DISPOSISI_TO_WD3';
        break;
      case 'KABAG_TU':
        newStatus = 'DISPOSISI_TO_KABAG_TU';
        break;
      case 'KAUR_AKADEMIK':
        newStatus = 'DISPOSISI_TO_KAUR_AKADEMIK';
        break;
      case 'KAUR_KEMAHASISWAAN':
        newStatus = 'DISPOSISI_TO_KAUR_KEMAHASISWAAN';
        break;
      case 'KAUR_KEUANGAN':
        newStatus = 'DISPOSISI_TO_KAUR_KEUANGAN';
        break;
      default:
        throw new Error(`Invalid role for disposition assignment: ${firstUserRole}`);
    }

    // 6. Update the letter request with instructions, new status and handler
    await db.update(letterRequestsTable)
      .set({
        dekan_instructions: input.instructions,
        status: newStatus as any,
        current_handler_user_id: input.assignments[0].user_id,
        updated_at: new Date()
      })
      .where(eq(letterRequestsTable.id, input.request_id))
      .execute();

    // 7. Create tracking log entry
    await db.insert(trackingLogsTable)
      .values({
        letter_request_id: input.request_id,
        user_id: dekanUserId,
        action_type: 'DISPOSISI_ASSIGNED',
        description: `Disposition assignments created by Dekan for ${input.assignments.length} officers`,
        notes: input.instructions,
        previous_status: 'FORWARDED_TO_DEKAN',
        new_status: newStatus as any
      })
      .execute();

    return dispositionAssignments;
  } catch (error) {
    console.error('Disposition creation failed:', error);
    throw error;
  }
}