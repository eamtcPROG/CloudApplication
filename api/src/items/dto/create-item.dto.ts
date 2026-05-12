import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class CreateItemDto {
  @ApiProperty({
    example: "first item",
    description: "Human-readable name",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @Length(1, 200)
  name: string;
}
