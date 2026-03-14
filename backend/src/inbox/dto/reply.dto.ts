import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ReplyDto {
  @ValidateIf((o) => !o.attachmentId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text?: string;

  @ValidateIf((o) => !o.text)
  @IsOptional()
  @IsString()
  attachmentId?: string;

  @ValidateIf((o) => !!o.attachmentId)
  @IsOptional()
  @IsString()
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}
