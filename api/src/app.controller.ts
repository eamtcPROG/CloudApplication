import { Controller, Get, Logger } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    this.logger.log("Root endpoint hit");
    return this.appService.getHello();
  }

  @Get("health")
  health(): { status: string } {
    this.logger.log("Health check endpoint hit");
    return { status: "ok" };
  }
}
