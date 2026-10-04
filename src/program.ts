import { Command } from "commander"
import { VERSION } from "./version.js"

export const createProgram = (): Command =>
  new Command("memo").description("Context about people across messengers, notes and mail").version(VERSION)
