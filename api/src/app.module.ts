import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import configuration from "./configuration";
import { HealthModule } from "./health/health.module";
import { Item } from "./items/item.entity";
import { ItemsModule } from "./items/items.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.getOrThrow<string>("db.host"),
        port: config.getOrThrow<number>("db.port"),
        username: config.getOrThrow<string>("db.username"),
        password: config.getOrThrow<string>("db.password"),
        database: config.getOrThrow<string>("db.database"),
        entities: [Item],
        migrations: [__dirname + "/migrations/*.{ts,js}"],
        migrationsRun: true,
        synchronize: config.get<boolean>("db.synchronize") ?? false,
      }),
    }),
    ItemsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
