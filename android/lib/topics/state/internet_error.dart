import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../logic/student/student_bloc.dart';

class InternetErrorScreen extends StatelessWidget {
  const InternetErrorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off_outlined,
                size: 48.0, color: Theme.of(context).colorScheme.primary),
            const Padding(
              padding: EdgeInsets.all(8.0),
              child: Text("Har du internet?"),
            ),
            FilledButton(
                onPressed: () {
                  context.read<StudentBloc>().add(LaunchedApp());
                },
                child: const Text("Prøv igen"))
          ],
        ),
      ),
    );
  }
}
