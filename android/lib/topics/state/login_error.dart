import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';

import '../../logic/student/student_bloc.dart';

class LoginErrorScreen extends StatelessWidget {
  const LoginErrorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Illustration(illustration: "error"),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16.0),
              child: Text(
                "Var det den rigtige kode?",
                style: theme.textTheme.titleLarge,
              ),
            ),
            FilledButton(
                onPressed: () {
                  context.read<StudentBloc>().add(ResetError());
                },
                child: const Text("Tilbage"))
          ],
        ),
      ),
    );
  }
}
