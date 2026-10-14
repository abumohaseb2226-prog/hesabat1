import NextAuth from "next-auth";
import { authOptions } from "@/auth";
import { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

export async function GET(req: NextRequest, ctx: any) {
  return handler(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
  return handler(req, ctx);
}