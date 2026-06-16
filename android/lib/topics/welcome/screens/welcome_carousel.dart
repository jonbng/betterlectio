import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/topics/welcome/screens/greeting.dart';
import 'package:betterlectio/topics/welcome/screens/gym.dart';
import 'package:betterlectio/topics/welcome/screens/login_screen.dart';

class WelcomeCarousel extends StatefulWidget {
  const WelcomeCarousel({super.key});

  @override
  State<WelcomeCarousel> createState() => _WelcomeCarouselState();
}

class _WelcomeCarouselState extends State<WelcomeCarousel> {
  late PageController carousel;

  final Duration animDuration = const Duration(milliseconds: 500);
  final Curve animCurve = Curves.easeInOut;


  @override
  void initState() {
    super.initState();
    var loginBloc = context.read<LoginBloc>();
    loginBloc.setGymSubmittedCallback(() {
      next();
    });
    int initial = 0;
    if (loginBloc.state.password.isNotEmpty &&
        loginBloc.state.username.isNotEmpty) {
      initial = 2;
    }
    carousel = PageController(initialPage: initial);
  }

  void next() {
    
    carousel.nextPage(duration: animDuration, curve: animCurve);
  }

  void back() {
    
    carousel.previousPage(duration: animDuration, curve: animCurve);
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      
      body: BlocBuilder<StudentBloc, StudentState>(builder: (context, state) {
        if (state.state == StudentStates.loading || state.gyms.isEmpty) {
          return const LoadingScreen();
        }
        return PageView(
          physics: const NeverScrollableScrollPhysics(),
          controller: carousel,
          children: [
            GreetingsScreen(
              next: next,
            ),
            GymScreen(
              next: next,
            ),
            LoginScreen(
              back: back,
            ),
          ],
        );
      }),
    );
  }

  @override
  void dispose() {
    super.dispose();
    carousel.dispose();
  }
}
