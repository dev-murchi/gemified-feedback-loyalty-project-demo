import { Module } from '@nestjs/common';

// Composition root: each context's module is wired in here as it is built (docs/07 §2).
@Module({})
export class AppModule {}
