import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}
