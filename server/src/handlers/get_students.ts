import { db } from '../db';
import { studentsTable } from '../db/schema';
import { type Student } from '../schema';
import { or, ilike, asc } from 'drizzle-orm';

export async function getStudents(searchTerm?: string): Promise<Student[]> {
  try {
    // Build query with proper typing
    const baseQuery = db.select().from(studentsTable);

    // Apply search filter if provided
    const queryWithFilter = searchTerm && searchTerm.trim()
      ? baseQuery.where(
          or(
            ilike(studentsTable.nim, `%${searchTerm.trim()}%`),
            ilike(studentsTable.name, `%${searchTerm.trim()}%`)
          )
        )
      : baseQuery;

    // Apply ordering and limit
    const finalQuery = queryWithFilter
      .orderBy(asc(studentsTable.name))
      .limit(100);

    const results = await finalQuery.execute();

    return results.map(student => ({
      ...student,
      created_at: student.created_at
    }));
  } catch (error) {
    console.error('Get students failed:', error);
    throw error;
  }
}