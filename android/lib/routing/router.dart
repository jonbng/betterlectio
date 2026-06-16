import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/state/mit_id_error.dart';
import 'package:betterlectio/topics/welcome/screens/uni_login_screen.dart';
import 'package:betterlectio/topics/welcome/screens/welcome_carousel.dart';

import '../logic/student/student_bloc.dart';
import '../topics/state/internet_error.dart';
import '../topics/state/loading.dart';
import '../topics/state/login_error.dart';
import 'root_controller.dart';

class AppRouter extends StatelessWidget {
  const AppRouter({super.key});
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentBloc, StudentState>(
      builder: (context, state) {
        switch (state.state) {
          case StudentStates.unilogin:
            return const UniLoginScreen();
          case StudentStates.unauthorized:
            return const WelcomeCarousel();
          case StudentStates.loading:
            return const LoadingScreen();
          case StudentStates.authorized:
            return const RootController();
          case StudentStates.internetError:
            return const InternetErrorScreen();
          case StudentStates.mitIDError:
            return const MitIdErrorScreen();
          case StudentStates.loginError:
            return const LoginErrorScreen();
        }
      },
    );
  }
}
