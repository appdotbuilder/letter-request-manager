import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type User, type UserRole } from '../schema';

export async function getUsersByRole(role: UserRole): Promise<User[]> {
  try {
    // Query users by role
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, role))
      .execute();

    return results;
  } catch (error) {
    console.error('Get users by role failed:', error);
    throw error;
  }
}