import { db } from '../db';
import { letterRequestsTable, usersTable, studentsTable } from '../db/schema';
import { type GetRequestsFilter, type LetterRequest } from '../schema';
import { eq, and, gte, lte, desc, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export async function getRequests(filter?: GetRequestsFilter, userId?: number): Promise<LetterRequest[]> {
  try {
    // Start with base query including necessary joins
    let query = db.select({
      id: letterRequestsTable.id,
      student_id: letterRequestsTable.student_id,
      created_by_user_id: letterRequestsTable.created_by_user_id,
      letter_type: letterRequestsTable.letter_type,
      purpose: letterRequestsTable.purpose,
      priority: letterRequestsTable.priority,
      status: letterRequestsTable.status,
      current_handler_user_id: letterRequestsTable.current_handler_user_id,
      dekan_instructions: letterRequestsTable.dekan_instructions,
      final_letter_url: letterRequestsTable.final_letter_url,
      created_at: letterRequestsTable.created_at,
      updated_at: letterRequestsTable.updated_at
    })
    .from(letterRequestsTable)
    .innerJoin(studentsTable, eq(letterRequestsTable.student_id, studentsTable.id))
    .innerJoin(usersTable, eq(letterRequestsTable.created_by_user_id, usersTable.id));

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    // Apply role-based filtering if userId is provided
    if (userId !== undefined) {
      // Get user information first to determine permissions
      const userResult = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      if (userResult.length > 0) {
        const user = userResult[0];
        
        // Role-based access control
        switch (user.role) {
          case 'STUDENT':
            // Students can only see requests they created (via their user account)
            conditions.push(eq(letterRequestsTable.created_by_user_id, userId));
            break;
            
          case 'STAFF_PRODI':
          case 'KAPRODI':
            // Prodi staff can see requests from their prodi
            if (user.prodi) {
              conditions.push(eq(studentsTable.prodi, user.prodi));
            }
            break;
            
          case 'DEKAN':
          case 'STAFF_FAKULTAS':
          case 'WD1':
          case 'WD2':
          case 'WD3':
          case 'KABAG_TU':
          case 'KAUR_AKADEMIK':
          case 'KAUR_KEMAHASISWAAN':
          case 'KAUR_KEUANGAN':
            // Faculty level roles can see requests assigned to them or all requests
            conditions.push(
              or(
                eq(letterRequestsTable.current_handler_user_id, userId),
                eq(letterRequestsTable.created_by_user_id, userId)
              )!
            );
            break;
            
          case 'ADMIN':
            // Admin can see all requests - no additional filtering
            break;
            
          default:
            // Unknown role - restrict access
            conditions.push(eq(letterRequestsTable.created_by_user_id, userId));
        }
      } else {
        // User not found - restrict to impossible condition
        conditions.push(eq(letterRequestsTable.id, -1));
      }
    }

    // Apply provided filters
    if (filter) {
      if (filter.status) {
        conditions.push(eq(letterRequestsTable.status, filter.status));
      }

      if (filter.priority) {
        conditions.push(eq(letterRequestsTable.priority, filter.priority));
      }

      if (filter.student_nim) {
        conditions.push(eq(studentsTable.nim, filter.student_nim));
      }

      if (filter.created_by_user_id) {
        conditions.push(eq(letterRequestsTable.created_by_user_id, filter.created_by_user_id));
      }

      if (filter.current_handler_user_id) {
        conditions.push(eq(letterRequestsTable.current_handler_user_id, filter.current_handler_user_id));
      }

      if (filter.from_date) {
        conditions.push(gte(letterRequestsTable.created_at, filter.from_date));
      }

      if (filter.to_date) {
        conditions.push(lte(letterRequestsTable.created_at, filter.to_date));
      }
    }

    // Build final query with conditional where clause and ordering
    const finalQuery = conditions.length > 0
      ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(letterRequestsTable.created_at))
      : query.orderBy(desc(letterRequestsTable.created_at));

    const results = await finalQuery.execute();

    return results;
  } catch (error) {
    console.error('Get requests failed:', error);
    throw error;
  }
}