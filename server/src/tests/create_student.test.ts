import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { studentsTable } from '../db/schema';
import { type CreateStudentInput } from '../schema';
import { createStudent } from '../handlers/create_student';
import { eq } from 'drizzle-orm';

// Simple test input
const testInput: CreateStudentInput = {
  nim: '12345678',
  name: 'John Doe',
  prodi: 'Computer Science'
};

describe('createStudent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a student', async () => {
    const result = await createStudent(testInput);

    // Basic field validation
    expect(result.nim).toEqual('12345678');
    expect(result.name).toEqual('John Doe');
    expect(result.prodi).toEqual('Computer Science');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save student to database', async () => {
    const result = await createStudent(testInput);

    // Query using proper drizzle syntax
    const students = await db.select()
      .from(studentsTable)
      .where(eq(studentsTable.id, result.id))
      .execute();

    expect(students).toHaveLength(1);
    expect(students[0].nim).toEqual('12345678');
    expect(students[0].name).toEqual('John Doe');
    expect(students[0].prodi).toEqual('Computer Science');
    expect(students[0].created_at).toBeInstanceOf(Date);
  });

  it('should create multiple students with different NIMs', async () => {
    const input1 = { ...testInput, nim: '11111111' };
    const input2 = { ...testInput, nim: '22222222' };

    const result1 = await createStudent(input1);
    const result2 = await createStudent(input2);

    expect(result1.nim).toEqual('11111111');
    expect(result2.nim).toEqual('22222222');
    expect(result1.id).not.toEqual(result2.id);

    // Verify both are saved in database
    const students = await db.select()
      .from(studentsTable)
      .execute();

    expect(students).toHaveLength(2);
    expect(students.map(s => s.nim)).toContain('11111111');
    expect(students.map(s => s.nim)).toContain('22222222');
  });

  it('should create students with different prodi values', async () => {
    const input1 = { ...testInput, nim: '11111111', prodi: 'Information Systems' };
    const input2 = { ...testInput, nim: '22222222', prodi: 'Software Engineering' };

    const result1 = await createStudent(input1);
    const result2 = await createStudent(input2);

    expect(result1.prodi).toEqual('Information Systems');
    expect(result2.prodi).toEqual('Software Engineering');

    // Verify both are saved correctly
    const students = await db.select()
      .from(studentsTable)
      .execute();

    expect(students).toHaveLength(2);
    const prodis = students.map(s => s.prodi);
    expect(prodis).toContain('Information Systems');
    expect(prodis).toContain('Software Engineering');
  });

  it('should enforce unique NIM constraint', async () => {
    // Create first student
    await createStudent(testInput);

    // Try to create another student with same NIM
    await expect(createStudent(testInput)).rejects.toThrow();
  });

  it('should handle long student names', async () => {
    const longNameInput: CreateStudentInput = {
      ...testInput,
      nim: '87654321',
      name: 'Very Long Student Name That Contains Many Characters And Should Still Work'
    };

    const result = await createStudent(longNameInput);

    expect(result.name).toEqual(longNameInput.name);
    expect(result.nim).toEqual('87654321');

    // Verify in database
    const students = await db.select()
      .from(studentsTable)
      .where(eq(studentsTable.nim, '87654321'))
      .execute();

    expect(students).toHaveLength(1);
    expect(students[0].name).toEqual(longNameInput.name);
  });
});