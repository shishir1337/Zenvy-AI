import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ConnectChannelDto {
  @IsEnum(['facebook', 'instagram'])
  type!: 'facebook' | 'instagram';

  @IsString()
  @IsOptional()
  pageId?: string;

  @IsString()
  @IsOptional()
  pageName?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  pageAccessToken!: string;

  @IsString()
  @IsOptional()
  instagramAccountId?: string;
}
