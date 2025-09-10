import { type CreateUserInput, type User } from '../schema';

export async function createUser(input: CreateUserInput): Promise<User> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is creating a new user in the system with role-based access.
    return Promise.resolve({
        id: 0, // Placeholder ID
        email: input.email,
        name: input.name,
        role: input.role,
        prodi: input.prodi || null,
        created_at: new Date(),
        updated_at: new Date()
    } as User);
}