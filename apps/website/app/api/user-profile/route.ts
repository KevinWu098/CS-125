import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "User ID can only contain letters, numbers, _ and -"),
});

const ratingRequestSchema = requestSchema.extend({
  restaurantId: z.string().trim().min(1).max(120),
  mealId: z.string().trim().min(1).max(160).optional(),
  rating: z.number().int().min(1).max(5),
});

const userRecordSchema = z.object({
  userId: z.string(),
  createdAtISO: z.string(),
  lastLoginAtISO: z.string(),
  loginCount: z.number().int().min(1),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  mealRatings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
});

const usersFilePath = path.join(process.cwd(), "data", "users.json");

type UserRecord = z.infer<typeof userRecordSchema>;

const readUsers = async (): Promise<UserRecord[]> => {
  try {
    const raw = await fs.readFile(usersFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => userRecordSchema.safeParse(entry))
      .filter((entry): entry is { success: true; data: UserRecord } => entry.success)
      .map((entry) => entry.data);
  } catch {
    return [];
  }
};

const writeUsers = async (users: UserRecord[]): Promise<void> => {
  await fs.mkdir(path.dirname(usersFilePath), { recursive: true });
  await fs.writeFile(usersFilePath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const parsed = requestSchema.safeParse({ userId });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid user ID",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const users = await readUsers();
  const user = users.find((entry) => entry.userId === parsed.data.userId);
  if (!user) {
    return NextResponse.json(
      {
        error: "User not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const nowISO = new Date().toISOString();
    const users = await readUsers();
    const existing = users.find((user) => user.userId === parsed.data.userId);

    if (existing) {
      existing.lastLoginAtISO = nowISO;
      existing.loginCount += 1;
      await writeUsers(users);

      return NextResponse.json({
        created: false,
        user: existing,
      });
    }

    const createdUser: UserRecord = {
      userId: parsed.data.userId,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO,
      loginCount: 1,
      ratings: {},
      mealRatings: {},
    };

    users.push(createdUser);
    await writeUsers(users);

    return NextResponse.json({
      created: true,
      user: createdUser,
    });
  } catch (error) {
    console.error("Failed to create profile", error);
    return NextResponse.json(
      {
        error: "Failed to create profile",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const parsed = ratingRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const users = await readUsers();
    const user = users.find((entry) => entry.userId === parsed.data.userId);
    if (!user) {
      return NextResponse.json(
        {
          error: "User not found",
        },
        { status: 404 },
      );
    }

    if (parsed.data.mealId) {
      const mealKey = `${parsed.data.restaurantId}::${parsed.data.mealId}`;
      user.mealRatings[mealKey] = parsed.data.rating;
    } else {
      user.ratings[parsed.data.restaurantId] = parsed.data.rating;
    }
    user.lastLoginAtISO = new Date().toISOString();
    await writeUsers(users);

    return NextResponse.json({
      user,
    });
  } catch (error) {
    console.error("Failed to update profile rating", error);
    return NextResponse.json(
      {
        error: "Failed to update profile rating",
      },
      { status: 500 },
    );
  }
}
