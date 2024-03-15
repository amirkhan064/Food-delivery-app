import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

export class JWTTokenSender {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  public sendToken(user: User) {
    const accessToken = this.jwtService.sign(
      {
        id: user.id,
      },
      {
        secret: this.configService.get<string>('ACTIVATION_TOKEN_SECRET'),
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        id: user.id,
      },
      {
        secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: '3d',
      },
    );

    return { user, accessToken, refreshToken };
  }
}
