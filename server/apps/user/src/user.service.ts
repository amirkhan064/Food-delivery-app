import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtVerifyOptions } from '@nestjs/jwt';
import { ActivationDto, LoginDto, RegisterDto } from './dto/user.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { EmailService } from './email/email.service';
import { JWTTokenSender } from './utils/sendToken';

export interface UserData {
  name: string;
  email: string;
  password: string;
  phone_number: string;
}

@Injectable()
export class UserService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private emailService: EmailService,
  ) {}

  // Register Service

  async register(registerDto: RegisterDto, response: Response) {
    const { name, email, password, phone_number } = registerDto;
    const isEmailExist = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });

    const isPhoneNumberExist = await this.prismaService.user.findUnique({
      where: {
        phone_number,
      },
    });

    if (isPhoneNumberExist) {
      throw new BadRequestException(`User ${name} phone already exists`);
    }

    if (isEmailExist) {
      throw new BadRequestException(`User ${name} email already exists`);
    }

    const hashPassword = await bcrypt.hash(password, 10);
    // const user = await this.prismaService.user.create({
    //   data: {
    //     name: name,
    //     email: email,
    //     password: hashPassword,
    //     phone_number: phone_number,
    //   },
    // });

    const user = {
      name: name,
      email: email,
      password: hashPassword,
      phone_number: phone_number,
    };

    const activationToken = await this.createActivationToken(user);

    const activationCode = activationToken.activationCode;

    const activation_token = activationToken.token;

    await this.emailService.sendMail({
      email,
      subject: 'Activate your Amato account!',
      template: './activation-mail',
      name,
      activationCode,
    });

    return { activation_token, response };
  }

  // create activation token
  async createActivationToken(user: UserData) {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
    const token = this.jwtService.sign(
      {
        user,
        activationCode,
      },
      {
        secret: this.configService.get<string>('ACTIVATION_TOKEN'),
        expiresIn: '5m',
      },
    );
    return { token: token, activationCode: activationCode };
  }

  //activate user after validating the activation code

  async activateUser(activationDto: ActivationDto, response: Response) {
    const { activationToken, activationCode } = activationDto;

    const newUser: { user: UserData; activationCode: string } =
      this.jwtService.verify(activationToken, {
        secret: this.configService.get<string>('ACTIVATION_TOKEN'),
      } as JwtVerifyOptions) as {
        user: UserData;
        activationCode: string;
      };

    if (newUser.activationCode !== activationCode) {
      throw new BadGatewayException('Invalid activation code');
    }

    const { name, email, password, phone_number } = newUser.user;

    const isEmailExist = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });

    const isPhoneNumberExist = await this.prismaService.user.findUnique({
      where: {
        phone_number,
      },
    });

    if (isPhoneNumberExist) {
      throw new BadRequestException(`User ${name} phone already exists`);
    }

    if (isEmailExist) {
      throw new BadRequestException(`User ${name} email already exists`);
    }

    const user = await this.prismaService.user.create({
      data: {
        name: name,
        email: email,
        password: password,
        phone_number: phone_number,
      },
    });
    return { user, response };
  }

  // Login Service
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });

    if (email && (await this.comparePassword(password, user.password))) {
      const tokenSender = new JWTTokenSender(
        this.jwtService,
        this.configService,
      );
      return tokenSender.sendToken(user);
    } else {
      return {
        user: null,
        accessToken: null,
        refreshToken: null,
        error: {
          message: 'invalid email or password',
        },
      };
    }
  }

  // compare with hashed password
  async comparePassword(
    password: string,
    UserPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(password, UserPassword);
  }

  async getUsers() {
    const user = this.prismaService.user.findMany();
    return user;
  }
}
