import { ApiProperty } from "@nestjs/swagger";
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "items" })
export class Item {
  @ApiProperty({ example: 1, description: "Auto-generated identifier" })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: "first item", description: "Human-readable name" })
  @Column({ type: "varchar", length: 200 })
  name: string;

  @ApiProperty({ example: "2026-05-12T10:00:00.000Z" })
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
