import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class AssignLabelDto {
  @ValidateIf((o) => !o.labelName)
  @IsString()
  labelId?: string;

  @ValidateIf((o) => !o.labelId)
  @IsString()
  labelName?: string;
}
