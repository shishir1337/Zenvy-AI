import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class FacebookPageInfoDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  pageAccessToken!: string;
}
