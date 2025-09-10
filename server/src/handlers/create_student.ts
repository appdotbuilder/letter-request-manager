import { db } from '../db';
import { studentsTable } from '../db/schema';
import { type CreateStudentInput, type Student } from '../schema';

export const createStudent = async (input: CreateStudentInput): Promise<Student> => {
  try {
    // Insert student record
    const result = await db.insert(studentsTable)
      .values({
        nim: input.nim,
        name: input.name,
        prodi: input.prodi
      })
      .returning()
      .execute();

    // Return the created student
    const student = result[0];
    return student;
  } catch (error) {
    console.error('Student creation failed:', error);
    throw error;
  }
};