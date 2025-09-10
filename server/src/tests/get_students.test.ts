import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { studentsTable } from '../db/schema';
import { type CreateStudentInput } from '../schema';
import { getStudents } from '../handlers/get_students';

// Test data
const testStudents: CreateStudentInput[] = [
  {
    nim: '1234567890',
    name: 'Ahmad Rizki',
    prodi: 'Teknik Informatika'
  },
  {
    nim: '1234567891',
    name: 'Siti Nurhaliza',
    prodi: 'Sistem Informasi'
  },
  {
    nim: '1234567892',
    name: 'Budi Santoso',
    prodi: 'Teknik Informatika'
  },
  {
    nim: '2023001001',
    name: 'Andi Wijaya',
    prodi: 'Teknik Elektro'
  },
  {
    nim: '2023001002',
    name: 'Rizki Ahmad',
    prodi: 'Teknik Mesin'
  }
];

describe('getStudents', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return all students when no search term provided', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents();

    expect(result).toHaveLength(5);
    expect(result[0].name).toEqual('Ahmad Rizki'); // Should be sorted by name
    expect(result[1].name).toEqual('Andi Wijaya');
    expect(result[2].name).toEqual('Budi Santoso');
    expect(result[3].name).toEqual('Rizki Ahmad');
    expect(result[4].name).toEqual('Siti Nurhaliza');

    // Verify all required fields are present
    result.forEach(student => {
      expect(student.id).toBeDefined();
      expect(student.nim).toBeDefined();
      expect(student.name).toBeDefined();
      expect(student.prodi).toBeDefined();
      expect(student.created_at).toBeInstanceOf(Date);
    });
  });

  it('should filter students by name search term', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('Ahmad');

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('Ahmad Rizki');
    expect(result[1].name).toEqual('Rizki Ahmad');
  });

  it('should filter students by NIM search term', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('2023001');

    expect(result).toHaveLength(2);
    expect(result[0].nim).toEqual('2023001001');
    expect(result[1].nim).toEqual('2023001002');
  });

  it('should perform case-insensitive search', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('siti');

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Siti Nurhaliza');
  });

  it('should handle partial matches', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('Rizki');

    expect(result).toHaveLength(2);
    expect(result.some(s => s.name === 'Ahmad Rizki')).toBe(true);
    expect(result.some(s => s.name === 'Rizki Ahmad')).toBe(true);
  });

  it('should return empty array when no matches found', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('NotExisting');

    expect(result).toHaveLength(0);
  });

  it('should handle empty search term', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('');

    expect(result).toHaveLength(5); // Should return all students
  });

  it('should handle whitespace-only search term', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('   ');

    expect(result).toHaveLength(5); // Should return all students
  });

  it('should return empty array when no students exist', async () => {
    const result = await getStudents();

    expect(result).toHaveLength(0);
  });

  it('should limit results to 100 students', async () => {
    // Create 150 test students
    const manyStudents = Array.from({ length: 150 }, (_, i) => ({
      nim: `student${i.toString().padStart(3, '0')}`,
      name: `Student ${i}`,
      prodi: 'Test Program'
    }));

    await db.insert(studentsTable).values(manyStudents).execute();

    const result = await getStudents();

    expect(result).toHaveLength(100); // Should be limited to 100
  });

  it('should search across both NIM and name fields', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('123456789');

    expect(result).toHaveLength(3); // Should match NIMs starting with 123456789
    expect(result.every(s => s.nim.includes('123456789'))).toBe(true);
  });

  it('should maintain sorting by name even with search results', async () => {
    // Create test students
    await db.insert(studentsTable).values(testStudents).execute();

    const result = await getStudents('Teknik');

    expect(result).toHaveLength(0); // 'Teknik' should not match names or NIMs
    
    // Test with a term that matches multiple results
    const rizkyResult = await getStudents('Rizki');
    
    expect(rizkyResult).toHaveLength(2);
    expect(rizkyResult[0].name).toEqual('Ahmad Rizki'); // Should come first alphabetically
    expect(rizkyResult[1].name).toEqual('Rizki Ahmad');
  });
});