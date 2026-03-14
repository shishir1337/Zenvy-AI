import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['inbox', 'follow_up', 'done'])
  status?: 'inbox' | 'follow_up' | 'done';

  @IsOptional()
  @IsString()
  notes?: string;
}
