import {
  IsString,
  IsNumber,
  IsPositive,
  Length,
  IsNotEmpty,
  IsUUID,
} from 'class-validator';

export class ProcessPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  /**
   * currency - Code ISO 4217
   */
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency!: string;
}
