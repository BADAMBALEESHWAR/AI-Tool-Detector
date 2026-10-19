import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// In-memory stand-in for the admin_users table.
const admins: { id: string; name: string; email: string; passwordHash: string; role: string }[] = [];

jest.mock('../utils/prisma', () => ({
  prisma: {
    adminUser: {
      count: jest.fn(async () => admins.length),
      findUnique: jest.fn(async ({ where }: any) => admins.find(a => (where.id ? a.id === where.id : a.email === where.email)) || null),
      create: jest.fn(async ({ data }: any) => {
        const admin = { id: `admin-${admins.length + 1}`, ...data };
        admins.push(admin);
        return admin;
      }),
    },
  },
}));

process.env.ADMIN_JWT_SECRET = 'test-admin-secret';
process.env.JWT_SECRET = 'test-student-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Imported after the mock so the router uses the in-memory table.
import { authRouter } from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const tokenFor = (adminId: string) => jwt.sign({ adminId, email: 'x', role: 'admin' }, 'test-admin-secret');
const body = (n: number) => ({ name: `Admin ${n}`, email: `admin${n}@nmims.test`, password: 'Passw0rd!x' });

describe('admin sign-up lockdown', () => {
  beforeEach(() => {
    admins.length = 0;
  });

  it('reports setup required only while no admin exists', async () => {
    expect((await request(app).get('/api/auth/admin/setup-status')).body).toEqual({ setupRequired: true });
    await request(app).post('/api/auth/admin/signup').send(body(1));
    expect((await request(app).get('/api/auth/admin/setup-status')).body).toEqual({ setupRequired: false });
  });

  it('lets the first account register publicly and makes it superadmin', async () => {
    const res = await request(app).post('/api/auth/admin/signup').send(body(1));
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe('superadmin');
  });

  it('rejects public sign-up once an admin exists', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    const res = await request(app).post('/api/auth/admin/signup').send(body(2));
    expect(res.status).toBe(403);
    expect(admins).toHaveLength(1);
  });

  it('rejects forged and non-superadmin tokens', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    admins.push({ id: 'plain', name: 'Plain', email: 'plain@nmims.test', passwordHash: 'x', role: 'admin' });

    const forged = jwt.sign({ adminId: 'admin-1' }, 'wrong-secret');
    expect((await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${forged}`).send(body(3))).status).toBe(403);
    expect((await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${tokenFor('plain')}`).send(body(4))).status).toBe(403);
    expect(admins).toHaveLength(2);
  });

  it('lets a superadmin create further admins with the admin role', async () => {
    await request(app).post('/api/auth/admin/signup').send(body(1));
    const res = await request(app).post('/api/auth/admin/signup').set('Authorization', `Bearer ${tokenFor('admin-1')}`).send(body(2));
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe('admin');
  });

  it('validates input before anything else', async () => {
    const res = await request(app).post('/api/auth/admin/signup').send({ name: '', email: 'bad', password: 'short' });
    expect(res.status).toBe(400);
  });
});
