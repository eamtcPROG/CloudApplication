import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { Item } from "./item.entity";
import { ItemsService } from "./items.service";

@ApiTags("items")
@Controller("items")
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @ApiOperation({ summary: "Create an item" })
  @ApiResponse({ status: 201, type: Item })
  create(@Body() dto: CreateItemDto): Promise<Item> {
    return this.items.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List all items" })
  @ApiResponse({ status: 200, type: Item, isArray: true })
  findAll(): Promise<Item[]> {
    return this.items.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single item by id" })
  @ApiResponse({ status: 200, type: Item })
  @ApiResponse({ status: 404, description: "Not found" })
  findOne(@Param("id", ParseIntPipe) id: number): Promise<Item> {
    return this.items.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an item" })
  @ApiResponse({ status: 200, type: Item })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ): Promise<Item> {
    return this.items.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete an item" })
  @ApiResponse({ status: 204, description: "Deleted" })
  remove(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.items.remove(id);
  }
}
