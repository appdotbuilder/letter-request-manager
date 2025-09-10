import { type CreateStudentInput, type Student } from '../schema';

export async function createStudent(input: CreateStudentInput): Promise<Student> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is creating a new student record in the system.
    return Promise.resolve({
        id: 0, // Placeholder ID
        nim: input.nim,
        name: input.name,
        prodi: input.prodi,
        created_at: new Date()
    } as Student);
}